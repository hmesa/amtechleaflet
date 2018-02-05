(function (window) {
    "use strict";

    var KNOWN_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

    class Logger {
        /**
         * 
         * @param {*string} loglevel : one of debug, log, info, warn, error
         * @param {(logLevel, text)=>void} logFcn function to log the messages
         */
        constructor(loglevel, logFcn) {
            this.loglevel = loglevel;
            this.disabled = false;
            if ((typeof loglevel === 'undefined')
                || KNOWN_LOG_LEVELS.indexOf(this.loglevel) == -1) {
                this.loglevel = 'info';
            }
            this.priority = KNOWN_LOG_LEVELS.indexOf(this.loglevel);
            this.log = this._log;
            if (typeof logFcn != "function") {
                logFcn = function (logLevel, text) {
                    console.log(logLevel.toUpperCase() + ": " + text);
                }
            }
            this.logFcn = logFcn;
        }

        isDebugEnabled() {
            return this.loglevel === 'debug';
        }

        /**
         * Logs a message depending on the active log level. Accepts two different
         * signatures:
         * 
         *  - log(msg): which logs a message in the default log level and 
         *  - log(level, msg): which logs a message in the log level specified
         *  
         *  IMPORTANT: Shouldn't be overwritten by descendant classes.
         * 
         */
        _log(/* level, msgpart0 [, msgpart1 [, msgpart2...]] */) {

            if (this.disabled) {
                return;
            }

            var args = Array.prototype.slice.call(arguments);
            var level = args.shift();
            var currentPriority = KNOWN_LOG_LEVELS.indexOf(level);
            if (currentPriority === -1) {
                level = this.loglevel;
                currentPriority = this.priority;
            }
            var msg = args.join(" ");
            if (currentPriority >= this.priority) {
                this.processLog(level, msg);
            }
        }

        /**
         * By default print the message to the system output with Console.log
         * 
         * @param level
         * @param msg
         */
        processLog() {
            var args = Array.prototype.slice.call(arguments);
            var level = args.shift();
            var msg = args.join(" ");
            this.logFcn(level, msg);
        }


        disableLogging() {
            this.disabled = true;
        }

        enableLogging() {
            this.disabled = false;
        }
        withFixExecInfo(param1, param2) {
            var sourceLogger = this;

            class FixLogger extends Logger {
                constructor(logLevel) {
                    super(sourceLogger.logLevel);
                }
                _log(level, msg) {
                    sourceLogger.log(level, param1, param2, msg);
                }
            }

            return new FixLogger();
        }
    }

    function createLogFunction() {
        var args1 = Array.prototype.slice.call(arguments);
        return function () {
            var args2 = Array.prototype.slice.call(arguments);
            var args = args1.concat(args2);
            this._log.apply(this, args);
        };
    }

    /**
     * Add to the prototype of the specified class the functions: debug, info, warn,
     * error. The prototype must have a function called log with the following
     * signature: log(level, msg)
     * 
     * @param level
     * @returns {Function}
     */
    function addLogFunctionsTo(clazz) {
        for (var i = 0; i < KNOWN_LOG_LEVELS.length; i++) {
            var level = KNOWN_LOG_LEVELS[i];
            clazz.prototype[level] = createLogFunction(level);
        }
    }

    addLogFunctionsTo(Logger);
    var logger = {
        KNOWN_LOG_LEVELS: KNOWN_LOG_LEVELS,
        Logger: Logger,
        createLogFunction: createLogFunction,
        addLogFunctionTo: addLogFunctionsTo
    }
    if (typeof module !== "undefined") {
        module.exports = logger
    } else {
        window.Loggers = logger;
    }
})(this);