/*
 *  Copyright (c) 2014-2014 amTech
 *  *
 *  * This file is subject to the terms and conditions defined in file 'LICENSE',
 *  * which is part of this source code package.
 */

/**
 * Created by hmesa on 03/09/14.
 */
function initAmtechObjects(window) {
    window.String.prototype.format = function () {
        // got from http://stackoverflow.com/questions/1038746/equivalent-of-string-format-in-jquery
        var args = arguments;
        return this.replace(/\{\{|\}\}|\{(\d+)\}/g, function (m, n) {
            if (m == "{{") { return "{"; }
            if (m == "}}") { return "}"; }
            return args[n];
        });
    };
    if (!window.Class || !(typeof window.Class.extend == "function")) {
        console.error("Invalid non extendable Class")
    }
    if (!window.amtech) {
        window.amtech = {};
    }
    if (!window.amtech.console) {
        window.amtech.console = {
            widgets: {},

            addWidget: function (widget) {
                var oldWidget = window.amtech.console.getWidget(widget.getName());
                if ((typeof oldWidget != "undefined") && (oldWidget != null)) {
                    oldWidget.destroy();
                }
                window.amtech.console.widgets[widget.getName()] = widget;
                return widget;
            },
            getWidgetName: function (id) {
                return "amWidget_" + id.replace(/:/g, "_");
            },
            getWidget: function (id) {
                return window.amtech.console.widgets[amtech.console.getWidgetName(id)];
            },
            I18N:{},
            utils: {
                classes: {},
                SEVERITY: {
                    INFO: "info",
                    WARN: "warn",
                    ERROR: "error",
                    FATAL: "fatal"
                },
                isString: function (instance) {
                    return typeof instance == "string"
                },
                verifyIfSuccessful: function (xhr, status, args, src) {
                    src = src || this;
                    if (args === undefined) {
                        console.error("error in ajax call");
                        src.remoteCallResult = "error in ajax call";
                        return false;
                    } else if ('errorMsg' in args && args['errorMsg'].length > 0) {
                        src.remoteCallResult = args['errorMsg'];
                        return false;
                    }

                    src.remoteCallResult = status;
                    return true;
                },
                escapeQuotes: function (input) {
                    // logger.debug("Escaping quotes from "+input+".\n
                    // result:"+input.replaceAll("'","\\'").replaceAll("\"","\\\""));
                    return input.replace(/'/g, "\\'").replace(/"/g, "\\\"");
                },
                preparePFMessages: function (messages) {
                    if (!messages || messages.length == 0) {
                        return [];
                    }
                    if (!(messages instanceof Array)) {
                        messages = [messages];
                    }
                    for (var i = 0; i < messages.length; i++) {
                        message = messages[i];
                        if (typeof message == "string") {
                            messages[i] = {
                                summary: message,
                                detail: message
                            };
                            message = messages[i];
                        }
                        message.severity = message.severity
                            || window.amtech.console.utils.SEVERITY.ERROR;
                        message.detail = message.detail || "";

                    }
                    return messages;
                },

                setTimeZonedDate: function (date, timeZoneId) {
                    var result = undefined;
                    if (typeof date != "undefined") {

                        if (typeof window.moment == "undefined"
                            || typeof window.moment.tz == "undefined") {
                            console
                                .warn("moment.timezone plugin is necessary in order to handle timezones");

                        } else {
                            if (typeof date == "string") {
                                date = new Date(date);
                            }
                            var m = window.moment.tz([date.getFullYear(),
                            date.getMonth(), date.getDate(),
                            date.getHours(), date.getMinutes(),
                            date.getSeconds()], timeZoneId);
                            result = m.toISOString();
                        }

                    }
                    return result;
                },
                getTimeZonedDate: function (dateString, timeZoneId) {
                    var result = undefined;
                    if (typeof dateString != "undefined") {
                        var date;
                        if (typeof dateString == "string") {
                            date = new Date(dateString);
                        } else {
                            date = dateString;
                        }
                        result = date;

                        if (typeof window.moment == "undefined"
                            || typeof window.moment.tz == "undefined") {
                            console
                                .warn("moment.timezone plugin is necessary in order to handle timezones");

                        } else {
                            var m = window.moment(date).tz(timeZoneId);
                            result = window.moment(m.format('YYYY-MM-DDTHH:mm:ss'))
                                .toDate();
                        }

                    }
                    return result;
                },

                getTimeZoneOffsetFormatted: function () {
                    var offset = new Date().getTimezoneOffset();
                    var h = Math.floor(Math.abs(offset) / 60);
                    var m = Math.abs(offset) % 60;
                    return ((offset <= 0) ? "+" : "-") + (h < 10 ? "0" : "")
                        + Math.abs(h).toString() + ":"
                        + ((m < 30) ? "00" : "30");
                }
            },            
            constants: {
                PROP_TYPE: "@type",
                PROP_ID: "@id",
                PROP_location: "location"
            },
            PATHS: {
                TYPE_ENTITY: "/amtech/linkeddata/types/composite/entity",
                ENTITIES: "/amtech/things/entities"
            }

        };
    }
    if (!window.amtech.console.Base) {
        window.amtech.console.Base = Class
            .extend({
                escapeJQLiteral: function (literal) {
                    return literal.replace(
                        /([!"#$%&'\(\)\*\+,\.\/:;<=>\?@\[\\\]^`\{\|\}~])/g,
                        '\\$1');
                },
                jqObj: function (id) {
                    var finalId = id;
                    if (this.id) {
                        finalId = this.id + ':' + id;
                    }
                    return $('#' + this.escapeJQLiteral(finalId));
                }
            });
    }

    window.amtech.console.utils.classes.Dictionary = Class.extend({
        init: function () {
            this.values = {};
        },
        store: function (name, value) {
            this.values[name] = value;
        },
        lookup: function (name) {
            return this.values[name];
        },
        contains: function (name) {
            return Object.prototype.propertyIsEnumerable.call(this.values, name)
        },
        each: function (action) {
            forEachIn(this.values, action);
        }
    });

    if (!window.amtech.console.widget) {
        window.amtech.console.widget = {
            BaseWidget: window.amtech.console.Base
                .extend({
                    init: function (cfg) {
                        this._eventHandlers = {};

                        this.id = cfg.id;
                        this.cfg = this.verifyCfg(cfg);
                        this.setLogger(cfg.logger);

                        this.containerId = this.cfg.containerId;

                        this.varName = window.amtech.console.getWidgetName(this.id);
                        this.parentWidget = null;
                        this.setChildrenWidgets();

                        this.controlsRemoved = true;
                        this.setHtmlControls();

                        this.update();
                    },
                    verifyCfg: function (cfg) {
                        if (!this.isDefined(cfg.containerId)) {
                            cfg.containerId = cfg.id;

                        }
                        if (!this.isDefined(cfg.widgetVar)) {
                            cfg.widgetVar = amtech.console
                                .getWidgetName(cfg.id);
                        }

                        if (!this.isDefined(cfg.logger)) {
                            cfg.logger = console;

                        }

                        return cfg;
                    },
                    setLogger:function(logger){
                        this.logger =logger||{};
                        ["log", "info", "debug", "warn", "error"].forEach((method) => {
                            if (typeof this.logger[method] != "function") {
                                this.logger[method] = function () {
                                    console.log.apply(console, 
                                    [method.toUpperCase() + ": "].concat(Array.prototype.slice.apply(arguments)));
                                }
                            }
                        })
                    },

                    sendMessageError: function (message) {
                        if (!message){
                            return;
                        }
                        this.sendMessage({
                            severity: window.amtech.console.utils.SEVERITY.ERROR,
                            summary: summary,
                            detail: detail
                        });
                        if (typeof message == "string") {
                            message = {
                                summary: message,
                                detail: '',
                                severity:  window.amtech.console.utils.SEVERITY.ERROR
                            }
                        } else if (typeof message != "object") {
                            this.logger.error("Invalid error message " + message);
                            return;
                        }

                        this.logger.debug("Error message received " + JSON.stringify(message));
                        this.fireEvent(this.EVENTS.ERROR, message);
                    },

                    setChildrenWidgets: function () {
                        this.childrenWidgets = {};
                    },
                    setParentWidget: function (parent) {
                        this.parentWidget = parent;
                    },
                    setHtmlControls: function () {
                        for (var child in this.childrenWidgets) {
                            if (this.isDefined(this.childrenWidgets[child])) {
                                this.childrenWidgets[child].setHtmlControls();
                            }
                        }

                        this.getRemovableControls = function () {
                            window.document.getElementById(this.id + "_removable")
                        };
                        this.controlsRemoved = false;

                    },
                    removeHtmlControlsFromDOM: function () {
                        for (var child in this.childrenWidgets) {
                            if (this.childrenWidgets[child]) {
                                this.childrenWidgets[child]
                                    .removeHtmlControlsFromDOM();
                            }
                        }

                        $(this.getRemovableControls().children).remove();
                        this.controlsRemoved = true;

                    },
                    update: function () {
                        for (var child in this.childrenWidgets) {
                            if (this.childrenWidgets.hasOwnProperty(child)) {
                                if (this.childrenWidgets[child]) {
                                    this.childrenWidgets[child].update();
                                }
                            }
                        }

                    },
                    getName: function () {
                        return this.varName;
                    },
                    fireEvent: function (type, eventData) {
                        if (!this._eventHandlers) {
                            return;
                        }
                        eventData = eventData || {};
                        this.logger.debug("firing event: " + type);
                        var type_idx = type + "_handlers";

                        eventData.src = eventData.src || this;
                        eventData.type = type;

                        var eventHandler = this._eventHandlers[type];
                        var externalEventHandler = this._eventHandlers[type_idx];

                        function callEvent(listener) {
                            listener.action.call(listener.context, eventData)
                        }

                        if (eventHandler) {
                            eventHandler.forEach(callEvent);
                        }
                        if (externalEventHandler) {
                            for (var key in externalEventHandler) {
                                if (externalEventHandler.hasOwnProperty(key)) {
                                    var listeners = externalEventHandler[key];
                                    this.logger.debug(listeners);
                                    listeners.forEach(callEvent);
                                }
                            }
                        }
                        this.fireEventOnce(type, eventData);

                    },
                    fireEventOnce: function (type, eventData) {
                        if (!this._eventHandlers) {
                            return;
                        }
                        eventData = eventData || {};
                        this.logger.debug("firing once time events for type " + type);
                        type += '_once';
                        var type_idx = type + "_handlers";
                        var type_idx_len = type + "_len";

                        eventData.src = eventData.src || this;
                        eventData.type = type;

                        var eventHandler = this._eventHandlers[type];
                        var externalEventHandler = this._eventHandlers[type_idx];

                        function callEvent(listener) {
                            listener.action.call(listener.context, eventData)
                        }

                        if (eventHandler) {
                            eventHandler.forEach(callEvent);
                            eventHandler.length = 0;
                        }
                        if (externalEventHandler) {

                            for (var key in externalEventHandler) {
                                if (externalEventHandler.hasOwnProperty(key)) {
                                    var listeners = externalEventHandler[key];
                                    listeners.forEach(callEvent);
                                    listeners.length = 0;
                                    delete externalEventHandler[key];
                                }
                            }
                            this._eventHandlers[type_idx_len] = 0;
                        }
                    },
                    notifyEvent: function (eventListener, eventData) {
                        this.logger.debug("notifying event for " + this.id);

                        if (!this.isDefined(eventListener)
                            || (eventListener.length == 0)) {
                            this.logger.debug("no event listener given");
                            return true
                        }
                        var functionObject = this
                            .getFunctionObject(eventListener);

                        if (functionObject != null) {
                            return functionObject.call(this, eventData);
                        } else {
                            this.logger.error("unknown function " + eventListener);
                            return false;
                        }

                    },

                    addEventListener: function (eventTypes, eventHandler,
                        context) {
                        var list, idx, handlers, isContextGiven, len;
                        var type_idx, type_idx_len;

                        var eventListenerHandler = this._eventHandlers;
                        for (list = eventTypes.split(), idx = 0,
                            len = list.length; idx < len; idx++) {
                            var type = list[idx];

                            isContextGiven = this.isDefined(context);

                            context = context || this;
                            var newHandler = {
                                action: eventHandler,
                                context: context
                            };
                            if (isContextGiven) {
                                type_idx = type + "_handlers";
                                type_idx_len = type_idx + "_len";
                                var c = eventListenerHandler[type_idx] = eventListenerHandler[type_idx]
                                    || {};

                                if (!c[context]) {
                                    c[context] = [];
                                    eventListenerHandler[type_idx_len] = (eventListenerHandler[type_idx_len] || 0) + 1;
                                }
                                c[context].push(newHandler);

                            } else {
                                eventListenerHandler[type] = eventListenerHandler[type]
                                    || [];
                                eventListenerHandler[type].push(newHandler);

                            }
                        }
                        return this;
                    },
                    addEventListenerOnce: function (eventTypes, eventHandler,
                        context) {
                        var list, idx, handlers, isContextGiven, len;
                        var type_idx, type_idx_len;

                        var eventListenerHandler = this._eventHandlers;
                        for (list = eventTypes.split(), idx = 0,
                            len = list.length; idx < len; idx++) {
                            var type = list[idx] + "_once";
                            var newHandler = {
                                action: eventHandler,
                                context: context
                            };

                            isContextGiven = this.isDefined(context);

                            context = context || this;
                            if (isContextGiven) {
                                type_idx = type + "_handlers";
                                type_idx_len = type_idx + "_len";
                                var c = eventListenerHandler[type_idx] = eventListenerHandler[type_idx]
                                    || {};

                                if (!c[context]) {
                                    c[context] = [];
                                    eventListenerHandler[type_idx_len] = (eventListenerHandler[type_idx_len] || 0) + 1;
                                }
                                c[context].push(newHandler);

                            } else {
                                eventListenerHandler[type] = eventListenerHandler[type]
                                    || [];
                                eventListenerHandler[type].push(newHandler);

                            }
                        }
                        return this;
                    },
                    removeEventListener: function (eventTypes, eventHandler,
                        context) {
                        var list, idx, handler, isContextGiven, len;
                        var type_idx, type_idx_len;
                        if (!eventTypes) {
                            return this.clearAllEventListeners();
                        }

                        var eventListenerHandler = this._eventHandlers;
                        for (list = eventTypes.split(), idx = 0,
                            len = list.length; idx < len; idx++) {
                            var type = list[idx];

                            isContextGiven = this.isDefined(context);

                            context = context || this;
                            if (isContextGiven) {
                                type_idx = type + "_handlers";
                                type_idx_len = type_idx + "_len";
                                var c = eventListenerHandler[type_idx] = eventListenerHandler[type_idx]
                                    || {};

                                if (handler = c[context]) {

                                    for (var i = 0; i < handler.length; i++) {
                                        if (handler[i].action == eventHandler) {
                                            handler.splice(i, 1);
                                        }
                                    }
                                    if (handler.length == 0) {
                                        delete c[context];
                                        delete eventListenerHandler[type_idx_len];
                                    }
                                }

                            } else {
                                handler = eventListenerHandler[type] = eventListenerHandler[type]
                                    || [];
                                for (var i = 0; i < handler.length; i++) {
                                    if (handler[i].action == eventHandler) {
                                        handler.splice(i, 1);
                                    }
                                }

                            }
                        }
                        return this;
                    },
                    removeEventListenerOnce: function (eventTypes,
                        eventHandler, context) {
                        var list, idx, handler, isContextGiven, len;
                        var type_idx, type_idx_len;

                        var eventListenerHandler = this._eventHandlers;
                        for (list = eventTypes.split(), idx = 0,
                            len = list.length; idx < len; idx++) {
                            var type = list[idx] + "_once";

                            isContextGiven = this.isDefined(context);

                            context = context || this;
                            if (isContextGiven) {
                                type_idx = type + "_handlers";
                                type_idx_len = type_idx + "_len";
                                var c = eventListenerHandler[type_idx] = eventListenerHandler[type_idx]
                                    || {};

                                if (handler = c[context]) {

                                    for (var i = 0; i < handler.length; i++) {
                                        if (handler[i].action == eventHandler) {
                                            handler.splice(i, 1);
                                        }
                                    }
                                    if (handler.length == 0) {
                                        delete c[context];
                                        delete eventListenerHandler[type_idx_len];
                                    }
                                }

                            } else {
                                handler = eventListenerHandler[type] = eventListenerHandler[type]
                                    || [];
                                for (var i = 0; i < handler.length; i++) {
                                    if (handler[i].action == eventHandler) {
                                        handler.splice(i, 1);
                                    }
                                }

                            }
                        }
                        return this;
                    },
                    clearEventListeners: function (eventType) {
                        var eventHandlers = this._eventHandlers;
                        if (eventHandlers[eventType]) {
                            eventHandlers[eventType].length = 0;
                        }
                        delete eventHandlers[eventType];

                        var type_idx = eventType + "_handlers";
                        var type_idx_len = type_idx + "_len";
                        if (eventHandlers[type_idx_len] > 0) {
                            var externalEventHandlers = eventHandlers[type_idx];

                            for (var context in externalEventHandlers) {
                                if (externalEventHandlers
                                    .hasOwnProperty(context)) {
                                    externalEventHandlers[context].length = 0;
                                    delete externalEventHandlers[context];

                                }
                            }
                            delete eventHandlers[type_idx];
                            eventHandlers[type_idx_len] = 0;
                        }
                    },
                    clearAllEventListeners: function () {
                        var eventHandlers = this._eventHandlers;

                        for (var type in eventHandlers) {
                            if (eventHandlers.hasOwnProperty(type)
                                && type.indexOf("_handlers") < 0) {
                                this.clearEventListeners(type);
                            }
                        }

                    },
                    isDefined: function (argument) {
                        return (typeof argument !== "undefined")
                            && (argument != null)
                    },
                    getContainer: function () {
                        return document.getElementById(this.containerId);
                    },
                    getFunctionObject: function (functionId) {
                        if (!this.isDefined(functionId)) {
                            return null;
                        }
                        if (typeof functionId == "function") {
                            return functionId;
                        } else if (functionId.length == 0) {
                            return null
                        }

                        var namespaces = functionId.split(".");
                        var functionObject;
                        var i = 0;
                        if (namespaces[0] == "this") {
                            functionObject = this;
                            i = 1;
                        } else {
                            functionObject = window;
                        }
                        while (functionObject != null && i < namespaces.length) {
                            functionObject = functionObject[namespaces[i]];
                            i++;
                        }

                        return functionObject;

                    },
                    getJQ: function () {
                        return $('#' + this.escapeJQLiteral(this.id));
                    }
                }),
            destroy: function () {
                for (var child in this.childrenWidgets) {
                    if (this.childrenWidgets.hasOwnProperty(child)
                        && this.childrenWidgets[child]) {
                        this.childrenWidgets[child].destroy();
                        this.childrenWidgets[child] = null;
                    }
                }
                this.parentWidget = null;
            }
        };

    }

    if (typeof window != "undefined") {
        
        if (typeof window.SVGElement != "undefined") {
            /*
             * adding functionality to SVGElements to add or remove classes taken from:
             * http://stackoverflow.com/questions/8638621/jquery-svg-why-cant-i-addclass
             */
            window.SVGElement.prototype.hasClass = function (className) {
                return new RegExp('(\\s|^)' + className + '(\\s|$)').test(this
                    .getAttribute('class'));
            };

            window.SVGElement.prototype.addClass = function (className) {
                if (!this.hasClass(className)) {
                    this.setAttribute('class', this.getAttribute('class') + ' '
                        + className);
                }
                return this;
            };

            window.SVGElement.prototype.removeClass = function (className) {
                var removedClass = this.getAttribute('class').replace(
                    new RegExp('(\\s|^)' + className + '(\\s|$)', 'g'), '$2');
                if (this.hasClass(className)) {
                    this.setAttribute('class', removedClass);
                }
                return this;
            };
        }
    }
}

if (typeof window != "undefined") {
    initAmtechObjects(window);
} else {
    module.exports = initAmtechObjects;
}