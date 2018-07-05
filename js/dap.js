(function (window) {
    "use strict";
    var dap = window.dap;
    if (!dap) {
        if (typeof require == "function") {
            dap = require("./baseDap.js");
        }
    }
    if (!dap || !dap.DapBaseController) {
        throw new Error("Missing import: unknown class DapBaseController");
    }
    var RestCallError = window.dap.RestCallError;
    var DapController = window.dap.DapBaseController;

    var HttpRequestRestCaller = window.dap.RestCaller.extend({
        init: function (cfg) {
            this._super(cfg);
            this.dapUrl = cfg.dapUrl;
            this._timeoutMs = cfg.timeoutMs || 60000;//60 seconds
            this.setCredentials(cfg.user, cfg.password);
        },
        loginCredentialsAndRestOptions: function () {
            var cred = (this.loginCredentials) ? this.loginCredentials() : {};
            cred.timeout = this._timeoutMs || 60000;
            return cred;
        },
        getUrlToDap: function (resourceUri, paramsObj) {
            return this.addParamsToUrl(this.dapUrl + resourceUri, paramsObj);
        },
        delete(url, paramsObj,done) {
             return this._restCall( "DELETE", [this.getUrlToDap(url, paramsObj), this.loginCredentialsAndRestOptions()],done);
        },
        get: function (url, paramsObj, done) {
            return this._restCall("GET", [this.getUrlToDap(url, paramsObj), this.loginCredentialsAndRestOptions()], done);
        },
        getBinary: function (url, paramsObj, done) {
            return this._restCallBinary("GET", [this.getUrlToDap(url, paramsObj), this.loginCredentialsAndRestOptions()], done);
        },
        post:function(url, json, paramsObj,done) {
            return this._restCall( "POST", [this.getUrlToDap(url, paramsObj), JSON.stringify(json), this.loginCredentialsAndRestOptions()],done);
        },
        put:function(url, json, paramsObj,done) {
            return this._restCall( "PUT", [this.getUrlToDap(url, paramsObj), JSON.stringify(json), this.loginCredentialsAndRestOptions()],done);
        },

        validateRestResponse: function (data, response) {
            var errorMsg = undefined;
            var statusCode = (response.statusCode != undefined) ? response.statusCode : response.status;
            if (!response || response == null || data instanceof Error || statusCode == undefined) {
                errorMsg = "unknown error: " + JSON.stringify(data, null, 10);

            } else if (statusCode != 200) {
                errorMsg = "unsuccessful response status: " + statusCode.toString();

            } else if (data instanceof Error) {
                errorMsg = "failed response : ------------------------------------\n  "
                    + JSON.stringify(data, null, 10);
            } else {
                errorMsg = this.validateDapResponse(data);
            }
            return errorMsg;
        },
        _restCall: function (type, args, done) {
            // [(optional)logger, method,url,(optional)data,options];

            var logger = this.logger;
            var self = this;
            try {
                // Do the usual XHR stuff
                var req = new XMLHttpRequest();
                var method = type ? type.toUpperCase() : "GET";
                var data;
                var url = args[0];
                var content = (args.length > 2) ? args[1] : undefined;
                var options = (args.length > 1) ? args[args.length - 1] : {};
                req.onreadystatechange = function () {
                    logger.debug("request state for " + url + " changed to " + this.readyState)
                    if (this.readyState == 4) {
                        // request ended
                        try {
                            var msg;
                            if (this.status >= 200 && this.status < 300) {
                                // Action to be performed when the document is
                                // read;
                                var hContentType = this.getResponseHeader('Content-Type');

                                var charset = "";
                                var contentType = "";
                                if (hContentType != undefined) {
                                    var split = hContentType.split(';');
                                    var contentTypeArr = split.splice(0, 1);
                                    contentType = contentTypeArr[0];
                                    split.forEach(function (item) {
                                        var keyValue = item.split("=");
                                        switch (keyValue[0]) {
                                            case "charset":
                                                if (keyValue.length > 1) {
                                                    charset = keyValue[1];
                                                }
                                                break;
                                            default:
                                                logger.debug("Unknown key " + item);
                                        }
                                    });
                                }
                                if (typeof options.stringParser == "function") {
                                    data = options.stringParser(this.responseText, contentType);
                                } else if (typeof options.parser == "function") {
                                    data = options.parser(this, contentType);
                                } else if (contentType.startsWith("application/json")) {
                                    data = JSON.parse(this.responseText);
                                } else {
                                    data = this.responseText;
                                }
                                msg = self.validateRestResponse(data, this);
                                if (!msg) {
                                    done(undefined, { content: data, contentType: contentType, charset: charset });
                                } else {
                                    done(new RestCallError(msg, data, this.status, this));
                                }

                            } else if (this.status > 0) {

                                msg = this.statusText;
                                if (typeof this.response == "string") {
                                    var json;
                                    try {
                                        json = JSON.parse(this.response);
                                        if (json.message) {
                                            msg = json.message + ((json.messagedetail) ? ": " + json.messagedetail : "");
                                        }
                                    } catch (e) {
                                        msg = this.response;
                                    }
                                }
                                done(new RestCallError(req.statusText, data, this.status, this));

                            }


                        } catch (e) {
                            done(e);
                        }
                    }
                };

                // arguments: METHOD, url, async?
                req.open(type.toUpperCase(), url, true);
                if (options.username) {
                    var auth64 = btoa(options.username + ":" + ((options.password ? options.password : "")));
                    req.setRequestHeader("Authorization", "Basic " + auth64);
                    req.withCredentials = true;
                }
                if (options.timeout) {
                    req.timeout = options.timeout;
                    req.ontimeout = function () {
                        done(new RestCallError("Timeout with request to " + url, undefined, this.status, this));
                    }
                }
                if (options.responseType) {
                    req.responseType = options.responseType;
                }

                // Handle network errors
                req.onerror = function () {
                    done(new RestCallError("Network Error", "", this.status, req));
                };

                if (method == "GET" || method == "HEAD") {
                    content = undefined;
                }
                // Make the request
                req.send(content);

            } catch (e) {
                done(e);
            }
        },
        _restCallBinary: function (type, args, done) {
            try {
                var parser = function (request, contentType) {
                    // make a copy of the response
                    return request.response;
                };
                var options = (args && args.length > 1) ? args[args.length - 1] : {};
                options.parser = parser;
                options.responseType = "blob";
                args[Math.max(args.length - 1, 1)] = options;
                this._restCall(type, args, done);
            } catch (e) {
                done(e);
            }
        }
    });
    //HttpRequestRestCaller = HttpRequestRestCaller;
    dap.createDapClient = function (logger, dapUrl, user, password) {
        var restCaller = new HttpRequestRestCaller({
            logger: logger,
            user: user,
            password: password,
            dapUrl: dapUrl
        });
        return new DapController(restCaller, logger);
    }

    if (typeof module !== "undefined") {
        module.exports = dap.createDapClient;
    } else {
        window.dap = dap;
    }
})(this);