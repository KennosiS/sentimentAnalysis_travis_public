'use strict';

var _ = require('lodash');
var assert = require('assert');
var util = require('util');
var logger = require('../logging').logger;
var tracer = require('../logging').tracer;
var JobManager = require('./JobManager');
var HttpError = require('../utils/http-error');


module.exports = JobsRuntime;

function JobsRuntime(rt) {
  assert(rt, 'runtime is required for jobs support');

  var jobsOptions = rt.get('jobs');
  if (!jobsOptions) {
    return;
  }

  this._rt = rt;

  var jobManager = this._createJobManager(jobsOptions);
  Object.defineProperty(this, '_jobManager', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: jobManager
  });
}

JobsRuntime.prototype.getValidJobs = function () {
  var jobs = [];
  var rt = this._rt;

  if (!rt) { return jobs; }

  Object.keys(rt.xsjobs).forEach(function(key) {
    var job = rt.xsjobs[key];
    if (job.active) {
      jobs.push(job);
    }
  });

  return jobs;
};

JobsRuntime.prototype.registerAllJobs = function() {
  if (this._jobManager) {
    this._jobManager.registerAllJobs(this.getValidJobs(), this._rt.get('appConfig'));
  }
};

JobsRuntime.prototype.startJobAsync = function(req) {
  if (!this._jobManager) {
    throw new Error('Cannot start job, job manager not initialized, ' +
      ' check if scheduler service is bound to this application');
  }
  var job = this._rt.getJob(req.path);
  if (!job) {
    throw new HttpError(404, 'Job not found');
  }

  return this._jobManager.startJobAsync(this._rt, job, req);
};

JobsRuntime.prototype._createJobManager = function(jobsOptions)
{
  var jobManager = new JobManager(jobsOptions, this._appConfig);

  jobManager.on('register', function(error, job) {
    if (error) {
      return logger.error('Failed to register job "%s", error: ', job.urlPath, errMessage(error));
    }
    tracer.info('Job "%s" registered successfully ', job.urlPath);
  }).on('job-finished', function(error, job, jobRunDetails) {
    var jobRunName = createJobRunName(job, jobRunDetails);
    if (error) {
      return logger.error('Job "%s" execution failed, error: ', jobRunName, errMessage(error));
    }
    tracer.info('Job "%s" finished successfully ', job.urlPath);
  }).on('status-update', function(error, job, jobRunDetails) {
    var jobRunName = createJobRunName(job, jobRunDetails);
    if (error) {
      return logger.error('Failed to update job "%s" status, error: ', jobRunName, errMessage(error));
    }
    tracer.info('Job "%s" status updated successfully', job.urlPath);
  });

  if (jobsOptions.listener) {
    this._registerJobListener(jobManager, jobsOptions.listener);
  }

  return jobManager;
};

JobsRuntime.prototype._registerJobListener = function(jobManager, jobListener) {
  if (_.isFunction(jobListener.onRegister)) {
    jobManager.on('register', jobListener.onRegister);
  }

  if (_.isFunction(jobListener.onJobFinished)) {
    jobManager.on('job-finished', jobListener.onJobFinished);
  }

  if (_.isFunction(jobListener.onStatusUpdate)) {
    jobManager.on('status-update', jobListener.onStatusUpdate);
  }
};

function errMessage(err) {
  if (util.isError(err)) { return err.message; }

  return err;
}

function createJobRunName(job, jobRunDetails) {
  return util.format('%s/%s/%s/%s', job.urlPath,
    jobRunDetails.jobId,
    jobRunDetails.scheduleId,
    jobRunDetails.runId);
}
