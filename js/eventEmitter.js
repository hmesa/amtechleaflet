(function (window) {
    "use strict"
    var getEventEmitterClass;
    if (typeof require == "function") {
        var NodeEventEmitter = require("events");

        getEventEmitterClass = () => {
            class EventEmitter {
                constructor() {
                    this._emitter = new NodeEventEmitter();
                }
                fireEvent(type, eventData) {
                    this._emitter.emit(type, eventData);
                    return this;
                }
                addEventListener(eventTypes, eventHandler,
                    context) {

                    for (let elem of eventTypes.split()) {
                        var listener = (context) ? eventHandler.bind(context) : eventHandler;
                        this._emitter.on(elem, listener);
                    }
                    return this;
                }
                addEventListenerOnce(eventTypes, eventHandler,
                    context) {
                    for (let elem of eventTypes.split()) {
                        var listener = (context) ? eventHandler.bind(context) : eventHandler;
                        this._emitter.once(elem, listener);
                    }
                    return this;
                }
                clearEventListeners(eventType) {
                    for (let elem of eventType.split()) {
                        this._emitter.removeAllListeners(elem);
                    }
                }
                clearAllEventListeners() {
                    this._emitter.removeAllListeners();
                }
                removeEventListener(eventTypes, eventHandler,
                    context) {
                    if (!eventTypes) {
                        return this.clearAllEventListeners();
                    }
                    if (context) {
                        console.log("we can not remove events with context, use bind instead")

                    } else {
                        for (let elem of eventTypes.split()) {
                            this._emitter.removeListener(elem, listener);
                        }
                    }
                    return this;
                }
            }
            return EventEmitter;
        }
    } else {
        getEventEmitterClass = () => {
            class EventEmitter {
                constructor() {
                    this._eventHandlers = {};
                }
                fireEvent(type, eventData) {
                    if (!this._eventHandlers) {
                        return;
                    }
                    eventData = eventData || {};
                    console.log("firing event: " + type);
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
                                console.log(listeners);
                                listeners.forEach(callEvent);
                            }
                        }
                    }
                    this.fireEventOnce(type, eventData);

                }
                fireEventOnce(type, eventData) {
                    if (!this._eventHandlers) {
                        return;
                    }
                    eventData = eventData || {};
                    console.log("firing once time events for type " + type);
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
                                console.log(listeners);
                                listeners.forEach(callEvent);
                                listeners.length = 0;
                                delete externalEventHandler[key];
                            }
                        }
                        this._eventHandlers[type_idx_len] = 0;
                    }
                }
                notifyEvent(eventListener, eventData) {
                    console.log("notifying event for ");
                    console.log(this);

                    if (!this.isDefined(eventListener)
                        || (eventListener.length == 0)) {
                        console.log("no event listener given");
                        return true
                    }
                    var functionObject = this
                        .getFunctionObject(eventListener);

                    if (functionObject != null) {
                        return functionObject.apply(this, [eventData]);
                    } else {
                        console.error("unknown function " + eventListener);
                        return false;
                    }

                }

                addEventListener(eventTypes, eventHandler,
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
                }
                addEventListenerOnce(eventTypes, eventHandler,
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
                }
                removeEventListener(eventTypes, eventHandler,
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
                }
                removeEventListenerOnce(eventTypes,
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
                }
                clearEventListeners(eventType) {
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
                }
                clearAllEventListeners() {
                    var eventHandlers = this._eventHandlers;

                    for (var type in eventHandlers) {
                        if (eventHandlers.hasOwnProperty(type)
                            && type.indexOf("_handlers") < 0) {
                            this.clearEventListeners(type);
                        }
                    }

                }
            }
            return EventEmitter;
        }
    }
    if (typeof module !== "undefined") {
        module.exports = getEventEmitterClass();
    } else {
        window.EventEmitter = getEventEmitterClass();
    }
})(this)