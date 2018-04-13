(function (window) {
    "use strict"

    if (typeof window.btoa == 'undefined') {
        window.btoa = function (string) { return Buffer.from(string, 'base64').toString("ascii"); };
        window.atob = function (string) { return Buffer.from(string).toString("base64"); };
    }
    var btoa = window.btoa;
    var atob = window.atob;
    var STATUS_CODES = {
        Unreachable: { code: 0, text: 'Unreachable' },
        Success: { code: 200, text: 'Success' },
        Created: { code: 201, text: 'Created' },
        Accepted: { code: 202, text: 'Accepted' },
        NonAuthoritativeInformation: { code: 203, text: 'Non-Authoritative Information' },
        NoContent: { code: 204, text: 'No Content' },
        ResetContent: { code: 205, text: 'Reset Content' },
        PartialContent: { code: 206, text: 'Partial Content' },
        MultipleChoices: { code: 300, text: 'Multiple Choices' },
        MovedPermanently: { code: 301, text: 'Moved Permanently' },
        Found: { code: 302, text: 'Found' },
        SeeOther: { code: 303, text: 'See Other' },
        NotModified: { code: 304, text: 'Not Modified' },
        UseProxy: { code: 305, text: 'Use Proxy' },
        TemporaryRedirect: { code: 307, text: 'Temporary Redirect' },
        BadRequest: { code: 400, text: 'Bad Request' },
        Unauthorized: { code: 401, text: 'Unauthorized' },
        PaymentRequired: { code: 402, text: 'Payment Required' },
        Forbidden: { code: 403, text: 'Forbidden' },
        NotFound: { code: 404, text: 'Not Found' },
        MethodNotAllowed: { code: 405, text: 'Method Not Allowed' },
        NotAcceptable: { code: 406, text: 'Not Acceptable' },
        ProxyAuthenticationRequired: { code: 407, text: 'Proxy Authentication Required' },
        RequestTimeout: { code: 408, text: 'Request Timeout' },
        Conflict: { code: 409, text: 'Conflict' },
        Gone: { code: 410, text: 'Gone' },
        LengthRequired: { code: 411, text: 'Length Required' },
        PreconditionFailed: { code: 412, text: 'Precondition Failed' },
        RequestEntityTooLarge: { code: 413, text: 'Request Entity Too Large' },
        RequestUriTooLong: { code: 414, text: 'Request-URI Too Long' },
        UnsupportedMediaType: { code: 415, text: 'Unsupported Media Type' },
        RequestedRangeNotSatisfiable: { code: 416, text: 'Requested Range Not Satisfiable' },
        ExpectationFailed: { code: 417, text: 'Expectation Failed' },
        InternalServerError: { code: 500, text: 'Internal Server Error' },
        NotImplemented: { code: 501, text: 'Not Implemented' },
        BadGateway: { code: 502, text: 'Bad Gateway' },
        ServiceUnavailable: { code: 503, text: 'Service Unavailable' },
        GatewayTimeout: { code: 504, text: 'Gateway Timeout' },
        HTTPVersionNotSupported: { code: 505, text: 'HTTP Version Not Supported' }
    };

    var RestCaller = window.Class.extend({
        init: function (cfg) {
            this.setLogger(cfg.logger);
        },
        setLogger: function (logger) {
            this.logger = logger || window.console;
        },
        addParamsToUrl: function (url, paramsObj) {
            if (!paramsObj) {
                return url;
            }
            if (url == undefined) {
                throw new Error("The url is undefined");
            } else {
                var sep = "&";
                if (url.indexOf('?') < 0) {
                    sep = "?";
                }
                for (var key in paramsObj) {
                    if (paramsObj.hasOwnProperty(key)) {
                        url += (sep + encodeURI(key) + "=" + encodeURI(paramsObj[key]));
                        sep = "&";
                    }
                }
            }
            return url;

        },

        validateDapResponse: function (data) {
            var errorMsg = "";
            if (!data) {
                errorMsg = "There was no response";
            } else if (data["@type"] == "/amtech/linkeddata/types/composite/outputMsg" &&
                data['success'] == false) {
                if ("message" in data && data.message.length > 0) {
                    errorMsg = data.message;
                    if ("messagedetail" in data && !data.messagedetail.length > 0) {
                        errorMsg += (": " + data.messagedetail);
                    }
                } else {
                    errorMsg = "unknown error: " + JSON.stringify(data, null, 10);
                }
            }
            return errorMsg;
        }

    });

    var RestCallError = window.inherits(Error, {
        constructor: function (message, data, statusCode, response) {
            this._super(this, message);
            this.data = data;
            this.response = response;
            this.statusCode = typeof statusCode !== "undefined" ? statusCode :
                response ? response.status : undefined;

        },
        getData: function () {
            return this.data;
        },
        getResponse: function () {
            return this.response;
        },
        getStatusCode: function () {
            return this.statusCode;
        }
    });
    
    var DapBaseController = window.Class.extend({
        init: function (restCaller, logger) {
            this.restCaller = restCaller;
            this.setLogger(logger);
        },
        setLogger: function (logger) {
            this.logger = logger || console;
        },
        get: function (url, paramsObj) {
            var self = this;
            return new Promise(function (resolve, reject) {
                try {
                    self.restCaller.get(
                        url, paramsObj,
                        function (err, result) {
                            if (err != null) {
                                reject(err);
                            } else {
                                resolve(result);
                            }

                        });
                } catch (e) {
                    reject(e);
                }

            });
        },
        getBinary: function (url, paramsObj) {
            var self = this;
            return new Promise(function (resolve, reject) {
                try {
                    self.restCaller.getBinary(
                        url, paramsObj,
                        function (err, result) {
                            if (err != null) {
                                reject(err);
                            } else {
                                resolve(result);
                            }

                        });
                } catch (e) {
                    reject(e);
                }

            });
        },
        getResource: function (resourceUri) {
            var logger = this.logger;
            return this.get(resourceUri)
                .then(function (response) {
                    logger.debug("loaded resource " + resourceUri);
                    return response
                });
        },
        getBinaryResource: function (resourceUri, paramsObj) {
            return this.getBinary(resourceUri, paramsObj)
                .then(function (response) {
                    this.logger.debug("loaded binary resource " + resourceUri);
                    return response
                })

        },
        getResourceSelfContained: function (resourceUri, mode) {
            var paramsObj = {};
            if (mode == undefined) {
                mode = "selfContained";
            }
            if (["selfContained", "fullSelfContained"].indexOf(mode) >= 0) {
                paramsObj[mode] = true;
            }
            return this.get(resourceUri, paramsObj);
        },
        getResourceField: function (resourceUri, field, contentType) {
            parmsObj = {
                property: field
            };
            if (contentType) {
                paramsObj["mtype"] = contentType;
            }
            return this.get(resourceUri, paramsObj);
        },
        mergeCollectionMembers: function (collection) {
            var members = [];
            var self = this;
            if (collection && collection.length > 0) {
                collection.forEach(function (element) {
                    var newMembers = self.getMembers(element);
                    if (newMembers) {
                        if (Array.isArray(newMembers) && newMembers.length > 0) {
                            members = members.concat(newMembers);
                        } else {
                            members.push(newMembers);
                        }
                    }
                });
            }
            return members;
        },
        getMembers: function (json) {
            if (Array.isArray(json)) {
                //it is the array of members
                return json;
            }
            var jsonType = json["@type"];

            switch (jsonType) {
                case "http://www.w3.org/ns/hydra/core#Collection":
                    return json["members"];
                case "/amtech/linkeddata/types/composite/queryresult":
                    return json["entities"];
                // embedded collections
                case "/amtech/linkeddata/types/composite/observerexecution":
                    if (json["queriesresults"]) {
                        return this.mergeCollectionMembers(this.getMembers(json["queriesresults"]));
                    }
                    break;
                case "/amtech/linkeddata/types/composite/query":
                    return this.mergeCollectionMembers(json["results"]);

                default:
                    return json;
            }
            return [];
        },
        getQueryResults: function (queryUri, queryParams) {
            var logger = this.logger;
            var self = this;
            return this.get(queryUri, queryParams).then(
                function (response) {
                    logger.debug("returned query json " + queryUri);
                    var data = response;
                    var contentType;
                    if (response.contentType) {
                        contentType = response.contentType;
                        data = response.content;
                    }
                    var members = self.getMembers(data);
                    if (members) {
                        logger.debug("Found ", members.length, " members");
                        return members;
                    } else {
                        throw new Error(response);
                    }
                }
            ).catch(function (error) {
                logger.error(error.message, error.statusCode ? "(" + error.statusCode + ")" : "");
                throw error;
                // return undefined;
            })
        }
    });
    var dap = {
        DapBaseController: DapBaseController,
        RestCaller: RestCaller,
        RestCallError: RestCallError,
        STATUS_CODES: STATUS_CODES,

    }
    if (typeof module !== "undefined") {
        module.exports = dap
    } else {
        window.dap = dap;
    }
})(this);