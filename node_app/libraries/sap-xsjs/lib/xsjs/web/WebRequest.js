'use strict';

var fs = require('fs');
var util = require('util');
var Locale = require('../Locale');
var CookiesTupelList = require('./TupelLists/CookiesTupelList');
var http = require('../constants').webTypes;
var contentTypeParser = require('content-type');
var WebEntityRequest = require('./WebEntityRequest');
var MultipartParser = require('./utils/MultipartParser');
var MESSAGE_TYPE = require('../constants').WEB.MESSAGE_TYPE;
var HttpError = require('../../utils/http-error');

module.exports = WebRequest;

function WebRequest(arg0, arg1) {
  if (this instanceof WebRequest) {
    WebEntityRequest.call(this, arg0);

    if (typeof arg0 === 'number') {
      var method = arg0;
      var path = arg1;
      if (typeof path !== 'string') {
        throw new Error('Expected string as a path (second argument)');
      }
      this.method = method;
      this.cookies = new CookiesTupelList();
      this.language = '';
      this.path = path || '';
      this.queryPath = '';
    } else {
      var req = arg0;
      normalizeRequestHeaders(this);
      setBodyOrEntities(this, req);
      addFormData(this, req);
      this.method = resolveMethod(req.method);
      this.cookies = new CookiesTupelList();
      this.cookies._addData(req.cookies);
      // keep in mind that this _localeObject is referenced outside this class as well
      this._localeObject = new Locale(this);
      setRequestLanguage(this);
      setPath(this, req.path);
      setQueryPath(this);
    }
  } else {
    return new WebRequest(arg0, arg1);
  }
}

util.inherits(WebRequest, WebEntityRequest);

function normalizeRequestHeaders(webRequest) {
  // erase the value of the cookie header if present
  if (webRequest.headers.get('cookie')) {
    webRequest.headers.set('cookie', '');
  }
  // erase the value of the authorization header if present (security issue)
  if (webRequest.headers.get('authorization')) {
    webRequest.headers.set('authorization', '');
  }
}

function setBodyOrEntities(webRequest, req) {
  var boundary = extractBoundaryOfMultipartRequest(webRequest);
  if (boundary) {
    try {
      MultipartParser.parseFromBuffer(req.body, boundary, webRequest, MESSAGE_TYPE.REQUEST);
      webRequest.body = undefined;
    } catch (err) {
      throw new HttpError(400, err.message);
    }
  } else {
    webRequest.setBody(req.body);
  }
}

function extractBoundaryOfMultipartRequest(webRequest) {
  var contentType = webRequest.headers.get('content-type');
  if (!contentType) {
    return '';
  }
  var isMultipart = contentType.indexOf('multipart') > -1;
  var isNotFormData = contentType.indexOf('form-data') < 0; // multiparty has alredy handled that
  if (isMultipart && isNotFormData) {
    var boundary = contentTypeParser.parse(contentType).parameters.boundary;
    if (!boundary) {
      throw new HttpError(400, 'Multipart request error. No boundary parameter found on header Content-Type ("' + contentType + '")');
    }
    return boundary;
  }
  return '';
}

function addFormData(webRequest, expressRequest) {
  var formData = expressRequest['form-data'];
  if (!formData) {
    return;
  }
  webRequest.body = undefined;

  reuseInputFieldsData(webRequest, formData);
  reuseFileUploadData(webRequest, formData);
}

function reuseInputFieldsData(webRequest, formData) {
  var inputFieldNames = Object.keys(formData.fields);

  inputFieldNames.forEach(function (singleInputFieldName) {
    var valuesForInputField = formData.fields[singleInputFieldName];
    valuesForInputField.forEach(function (singleValue) {
      var headers = { 'content-disposition': 'form-data; name="' + singleInputFieldName + '"' };
      var parameters = {};
      parameters[singleInputFieldName] = singleValue;
      var body = singleValue;
      webRequest.entities.push(WebEntityRequest.create(headers, parameters, body));
    });
  });
}

function reuseFileUploadData(webRequest, formData) {
  var uploaderNames = Object.keys(formData.files);

  uploaderNames.forEach(function (singleUploaderName) {
    var uploadedFiles = formData.files[singleUploaderName];
    uploadedFiles.forEach(function (singleUploadedFile) {
      var headers = singleUploadedFile.headers;
      headers['~content_disposition'] = 'form-data';
      headers['~content_name'] = singleUploaderName;
      headers['~content_filename'] = singleUploadedFile.originalFilename;
      // the last one is extra comapring to the XSEngine headers
      headers['~content_file_size'] = singleUploadedFile.size;

      var body = readUploadedFile(singleUploadedFile.path);
      removeFileOnFileSystem(singleUploadedFile.path);

      webRequest.entities.push(WebEntityRequest.create(headers, {}, body));
    });
  });
}

function readUploadedFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function removeFileOnFileSystem(filePath) {
  fs.unlinkSync(filePath);
}

function resolveMethod(method) {
  switch (method) {
  case 'OPTIONS':
    return http.OPTIONS;
  case 'GET':
    return http.GET;
  case 'HEAD':
    return http.HEAD;
  case 'POST':
    return http.POST;
  case 'PUT':
    return http.PUT;
  case 'DELETE':
    return http.DEL;
  case 'TRACE':
    return http.TRACE;
  case 'CONNECT':
    return http.CONNECT;
  default:
    return http.INVALID;
  }
}

function setRequestLanguage(webRequest) {
  Object.defineProperty(webRequest, 'language', {
    value: webRequest._localeObject.requestLanguage,
    enumerable: true
  });
}

function setPath(webRequest, reqPath) {
  var pathPattern = /(.+\.xsjs[^\?]*)(\?.+)?/;
  var result = pathPattern.exec(reqPath);
  if (result && result.length > 1) {
    webRequest.path = result[1];
  } else {
    webRequest.path = reqPath;
  }
}

function setQueryPath(webRequest) {
  var beginOfQueryPath = webRequest.path.indexOf('.xsjs/');
  if (beginOfQueryPath > 0) {
    beginOfQueryPath += '.xsjs/'.length;
    webRequest.queryPath = webRequest.path.substring(beginOfQueryPath);
  } else {
    webRequest.queryPath = '';
  }
}
