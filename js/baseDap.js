(function (window) {
    "use strict"

    if (typeof window.btoa == 'undefined') {
        window.btoa = (string) => { return Buffer.from(string, 'base64').toString("ascii"); };
        window.atob = (string) => { return Buffer.from(string).toString("base64"); };
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
        setCredentials: function (user, password) {
            if (!user || !password) {
                this.loginCredentials = undefined;
                return;
            } else if (this.loginCredentials != undefined) {
                var cred = this.loginCredentials();
                if (cred.username == user && cred.password == password) {
                    return;
                }
            }
            this.loginCredentials = function() {
                return {
                    username: user,
                    password: password,
                };
            }
            this.logger.debug("setting credentials");
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
                for (let key in paramsObj) {
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
    class RestCallError extends Error {
        constructor(message, data, statusCode, response) {
            super(message);
            this.data = data;
            this.response = response;
            this.statusCode = typeof statusCode !== "undefined" ? statusCode :
                response ? response.status : undefined;

        }
        getData() {
            return this.data;
        }
        getResponse() {
            return this.response;
        }
        getStatusCode() {
            return this.statusCode;
        }
    };

    var DapBaseController = window.Class.extend({
        init: function (restCaller, logger) {
            this.restCaller = restCaller;
            this.setLogger(logger);
        },
        setLogger: function (logger) {
            this.logger = logger || console;
        },
        get: function (url, paramsObj) {
            return new Promise((resolve, reject) => {
                try {
                    this.restCaller.get(
                        url, paramsObj,
                        (err, result) => {
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
            return new Promise((resolve, reject) => {
                try {
                    this.restCaller.getBinary(
                        url, paramsObj,
                        (err, result) => {
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
        post: function (url, json, paramsObj) {
            return new Promise((resolve, reject) => {
                try {
                    this.restCaller.post(
                        url, json, paramsObj,
                        (err, result) => {
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
        put: function (url, json, paramsObj) {
            return new Promise((resolve, reject) => {
                try {
                    this.restCaller.put(
                        url, json, paramsObj,
                        (err, result) => {
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
        delete: function (url, paramsObj) {
            return new Promise((resolve, reject) => {
                try {
                    this.restCaller.delete(
                        url, paramsObj,
                        (err, result) => {
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
            return this.get(resourceUri)
                .then((response) => {
                    this.logger.debug("loaded resource " + resourceUri);
                    return response
                });
        },
        getBinaryResource: function (resourceUri, paramsObj) {
            return this.getBinary(resourceUri, paramsObj)
                .then((response) => {
                    this.logger.debug("loaded binary resource " + resourceUri);
                    return response
                })

        },
        postResource(resource) {
            var resourceUri = resource["@id"];
            var resourceType= resource["@type"];
            if (!resourceUri ||!resourceType){
                return Promise.reject("Missing id or type in resource "+JSON.stringify(resource));
            }
            var url=window.CONSTANTS.PATHS.ROOT;
            if (resourceUri.startsWith(window.CONSTANTS.PATHS.TYPES+"/")){
                url = window.CONSTANTS.PATHS.TYPES;
            }
            return this.post( url, resource).then((response) => {
                    this.logger.debug("Send \"new\" request for resource " + resourceUri);
                    return response;
                });
        },
        putResource: function (resource) {
            var resourceUri = resource["@id"];
            var resourceType= resource["@type"];
            if (!resourceUri ||!resourceType){
                return Promise.reject("Missing id or type in resource "+JSON.stringify(resource));
            }
            var url=window.CONSTANTS.PATHS.ROOT;
            if (resourceUri.startsWith(window.CONSTANTS.PATHS.TYPES+"/")){
                url=window.CONSTANTS.PATHS.TYPES;
            }
            return this.put(url, resource)
                .then((response) => {
                    this.logger.debug("Updated resource " + resourceUri);
                    return response;
                });
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
            var parmsObj = {
                property: field
            };
            if (contentType) {
                paramsObj["mtype"] = contentType;
            }
            return this.get(resourceUri, paramsObj);
        },
        mergeCollectionMembers: function (collection) {
            var members = [];
            if (collection && collection.length > 0) {
                collection.forEach((element) => {
                    var newMembers = this.getMembers(element);
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

            return this.get(queryUri, queryParams).then(
                (response) => {
                    this.logger.debug("returned query json " + queryUri);
                    var data = response;
                    var contentType;
                    if (response.contentType) {
                        contentType = response.contentType;
                        data = response.content;
                    }
                    var members = this.getMembers(data);
                    if (members) {
                        this.logger.debug("Found ", members.length, " members");
                        return members;
                    } else {
                        throw new Error(response);
                    }
                }
            ).catch((error) => {
                this.logger.error(error.message, error.statusCode ? "(" + error.statusCode + ")" : "");
                throw error;
                // return undefined;
            })
        },
        setCredentials(user,password){
            this.restCaller.setCredentials(user,password);
        },
        getBridgeInstancesByMacAddress(macAddress) {
            if (!macAddress || macAddress.length == 0) {
                return Promise.resolve(undefined);
            }
            return this.getQueryResults("/amtech/system/queries/thingsbytype", {
                typeUrl: "/amtech/linkeddata/types/composite/entity/amtechM2mBridge",
                selfContained: "true",
                "/amtech/system/queries/thingsbytype/constraints": JSON.stringify([{
                    "@id": "/amtech/system/queries/thingsbytype/constraints/_name",
                    _name: "_name",
                    field: "_name",
                    _fieldUri: "/amtech/linkeddata/types/composite/entity/amtechM2mBridge/_name",
                    "@type": "/amtech/linkeddata/types/composite/constraint/stringregex",
                    operator: "regex",
                    paramsList: [
                        "regex"
                    ],
                    regex: ".*:" + macAddress
                }])
            }).then((response) => {
                let content;
                if (!response.contentType) {
                    content = response;
                } else if (response.contentType == "application/json") {
                    content = response.content;
                }
                if (content && !Array.isArray(content)) {
                    content = [content];
                }

                return content;
            })
        },
        getThingsInWkt(wkt, tenantToUse) {
            var options = {
                "geofence": wkt
            };
            if (tenantToUse && tenantToUse.length > 0) {
                options["/amtech/system/queries/thingswithinwkt/constraints"] = [{
                    "@type": "/amtech/linkeddata/types/composite/constraint/comparisonstring",
                    "field": "_tenant",
                    "_fieldUri": window.CONSTANTS.PATHS.TYPES + "/entity/_tenant",
                    "operator": "eq",
                    "value": tenantToUse
                }]
            };
            return this.getQueryResults("/amtech/system/queries/thingswithinwkt", options);
        },
        deleteBridgeAndInstances(macAddress, tenantToUse) {
            return this.getBridgeInstancesByMacAddress(macAddress).then((response) => {
                if (!response || !response.length) {
                    return response
                } else {
                    var list = [];
                    var promises = response.map((bridge) => {
                        let newPromise;
                        let bridgeUri;
                        let bridgeName;
                        let bridgeInstances = undefined;
                        if (typeof bridge == "string") {
                            bridgeUri = bridge;
                            bridgeName = bridge.substr(bridge.lastIndexOf("/") + 1);
                        } else {
                            bridgeUri = bridge["@id"];
                            bridgeName = bridge._name;
                            if (bridge.bridgeInstances && !Array.isArray(bridge.bridgeInstances)) {
                                bridgeInstances = bridge.bridgeInstances.members;
                            } else {
                                bridgeInstances = bridge.bridgeInstances;
                            }
                        }
                        newPromise = this.delete(bridgeUri);
                        if (bridgeInstances && bridgeInstances.length > 0) {
                            newPromise = newPromise.then((response) => {
                                return this.deleteAll(bridgeInstances);
                            });
                        }
                        return newPromise.then((ignored) => {
                            return this.getQueryResults("/amtech/system/queries/thingsbytype", {
                                typeUrl: "/amtech/linkeddata/types/composite/entity/geofence",
                                "/amtech/system/queries/thingsbytype/constraints": JSON.stringify([{
                                    "@id": "/amtech/system/queries/thingsbytype/constraints/_name",
                                    _name: "_name",
                                    field: "_name",
                                    _fieldUri: "/amtech/linkeddata/types/composite/entity/amtechM2mBridge/_name",
                                    "@type": "/amtech/linkeddata/types/composite/constraint/stringregex",
                                    operator: "regex",
                                    paramsList: [
                                        "regex"
                                    ],
                                    regex: "geofence:" + bridgeName
                                }])
                            }).then((geofences) => {
                                var mapPromises = geofences.map((geofence) => {
                                    let loc = geofence.location;
                                    return this.getThingsInWkt(loc.wkt || loc, tenantToUse).then((list) => {
                                        var geofenceUrl = geofence["@id"];
                                        var exist = false;
                                        var i = -1;
                                        while (!exist && ++i < list.length) {
                                            exist = list[i]["@id"] == geofenceUrl;
                                        }
                                        if (!exist) {
                                            list.push(geofence);
                                        }
                                        return this.deleteAll(list);
                                    })
                                });
                                return Promise.all(mapPromises);
                            })

                        })
                    });
                    return Promise.all(promises);
                }

            })
        },
        deleteAll(list) {

            var promiseArray = list.map((item) => {
                if (item && typeof item !== "string") {
                    item = item["@id"];
                }
                return (item) ? this.delete(item) : Promise.resolve();
            });

            return Promise.all(promiseArray);
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