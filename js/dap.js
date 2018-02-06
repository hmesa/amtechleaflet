(function (window) {
    "use strict"
    var dap = window.dap;
    if (!dap) {
        if (typeof require == "function") {
            var dap = require("./baseDap.js");
        }
    } 
    if (!dap ||!dap.DapBaseController) {
        throw new Error("Missing import: unknown class DapBaseController");
    } 
    var RestCallError = window.dap.RestCallError;
    var STATUS_CODES = window.dap.STATUS_CODES;
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
        setCredentials: function (user, password) {
            if (!user || !password) {
                this.loginCredentials = undefined;
                return;
            } else if (this.loginCredentials != undefined) {
                var cred = this.loginCredentials();
                if (cred.user == user && cred.password == password) {
                    return;
                }
            }
            this.loginCredentials = () => {
                return {
                    username: user,
                    password: password,
                };
            }
            this.logger.debug("setting credentials");
        },
        getUrlToDap: function (resourceUri, paramsObj) {
            return this.addParamsToUrl(this.dapUrl + resourceUri, paramsObj);
        },
        get(url, paramsObj, done) {
            return this._restCall("GET", [this.getUrlToDap(url, paramsObj), this.loginCredentialsAndRestOptions()], done);
        },
        getBinary(url, paramsObj, done) {
            return this._restCallBinary("GET", [this.getUrlToDap(url, paramsObj), this.loginCredentialsAndRestOptions()], done);
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
                                    split.forEach((item) => {
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
                                    })
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

                                var msg = this.statusText;
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
                    req.ontimeout = () => {
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
                var parser = (request, contentType) => {
                    // make a copy of the response
                    return request.response;
                }
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
    /*
        class DapController {
            constructor(dapUrl, user, pass, logger) {
                this.dapUrl = dapUrl;
                this.setLogger(logger);
                this.setCredentials(user, pass);
            }
            setLogger(logger) {
                this.logger = (logger) ? logger : console;
            }
            loginCredentialsAndRestOptions() {
                var cred = (this.loginCredentials) ? this.loginCredentials() : {};
                cred.timeout = this._timeoutMs || 60000;
                return cred;
            }
            setCredentials(user, password) {
                if (!user || !password) {
                    this.loginCredentials = undefined;
                    return;
                } else if (this.loginCredentials != undefined) {
                    var cred = this.loginCredentials();
                    if (cred.user == user && cred.password == password) {
                        return;
                    }
                }
                this.loginCredentials = () => {
                    return {
                        username: user,
                        password: password,
                    };
                }
                this.logger.debug("setting credentials");
            }
            delete(url, paramsObj) {
                return restCall(this.logger, "delete", [this.getUrlToDap(url, paramsObj), this.loginCredentialsAndRestOptions()]);
            }
            get(url, paramsObj) {
                return restCall(this.logger, "get", [this.getUrlToDap(url, paramsObj), this.loginCredentialsAndRestOptions()]);
    
            }
            getResource(resourceUri) {
                return this.get(resourceUri)
                    .then((response) => { console.log("loaded resource " + resourceUri); return response });
            }
            getBinaryResource(resourceUri, paramsObj) {
                return restCallBinary(this.logger, "get", [this.getUrlToDap(resourceUri, paramsObj), this.loginCredentialsAndRestOptions()])
                    .then((response) => {
                        this.logger.debug("loaded binary resource " + resourceUri);
                        return response
                    })
    
            }
            getResourceSelfContained(resourceUri, mode) {
                var paramsObj = {};
                if (mode == undefined) {
                    mode = "selfContained";
                }
                if (["selfContained", "fullSelfContained"].indexOf(mode) >= 0) {
                    paramsObj[mode] = true;
                }
                return this.get(resourceUri, paramsObj);
            }
            getResourceField(resourceUri, field, contentType) {
                parmsObj = {
                    property: field
                };
                if (contentType) {
                    paramsObj["mtype"] = contentType;
                }
                return this.get(resourceUri, paramsObj);
            }
            postResource(url, json, paramsObj) {
                return restCall(this.logger, "post", [this.getUrlToDap(url, paramsObj), JSON.stringify(json), this.loginCredentialsAndRestOptions()]);
            }
            putResource(url, json, paramsObj) {
                return restCall(this.logger, "put", [this.getUrlToDap(url, paramsObj), JSON.stringify(json), this.loginCredentialsAndRestOptions()]);
            }
            addCollectionMembers(collection) {
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
            }
            getMembers(json) {
                if (Array.isArray(json)){
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
                            return this.addCollectionMembers(this.getMembers(json["queriesresults"]));
                        }
                        break;
                    case "/amtech/linkeddata/types/composite/query":
                        return this.addCollectionMembers(json["results"]);
    
                    default:
                        return json;
                }
                return [];
            }
            getQueryResults(queryUri, queryParams) {
    
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
            }
    
            getUrlToDap(resourceUri, paramsObj) {
                return addParamsToUrl(this.dapUrl + resourceUri, paramsObj);
            }
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
                        fieldUri: "/amtech/linkeddata/types/composite/entity/amtechM2mBridge/_name",
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
            }
            getThingsInWkt(wkt, tenantToUse) {
                var options = {
                    "geofence": wkt
                };
                if (tenantToUse && tenantToUse.length > 0) {
                    options["/amtech/system/queries/thingswithinwkt/constraints"] = [{
                        '@type': '/amtech/linkeddata/types/composite/constraint/comparisonstring',
                        'field': '_tenant',
                        '_fieldUri': CONSTANTS.PATHS.TYPES + "/entity/_tenant",
                        'operator': 'eq',
                        'value': tenantToUse
                    }]
                };
                return this.getQueryResults("/amtech/system/queries/thingswithinwkt", options);
            }
            deleteBridgeAndInstances(macAddress,tenantToUse) {
                return this.getBridgeInstancesByMacAddress(macAddress).then((response) => {
                    if (!response || !response.length) {
                        return response
                    } else {
                        var list = [];
                        var promises = response.map((bridge) => {
                            let newPromise;
                            let bridgeUri;
                            let bridgeName;
                            let bridgeInstances=undefined;
                            if (typeof bridge == "string") {
                                bridgeUri = bridge;
                                bridgeName = bridge.substr(bridge.lastIndexOf("/") + 1);
                            } else {
                                bridgeUri = bridge["@id"];
                                bridgeName = bridge._name;
                                if (bridge.bridgeInstances && !Array.isArray(bridge.bridgeInstances)){
                                    bridgeInstances = bridge.bridgeInstances.members;
                                }else{
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
                                        fieldUri: "/amtech/linkeddata/types/composite/entity/amtechM2mBridge/_name",
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
                                        return this.getThingsInWkt(loc.wkt || loc,tenantToUse).then((list) => {
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
            }
            deleteAll(list) {
    
                var promiseArray = list.map((item) => {
                    if (item && typeof item !== "string") {
                        item = item["@id"];
                    }
                    return (item) ? this.delete(item) : Promise.resolve();
                });
    
                return Promise.all(promiseArray);
            }
        }
    */
    HttpRequestRestCaller = HttpRequestRestCaller;
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
        window.dap=dap;
    }
})(this);