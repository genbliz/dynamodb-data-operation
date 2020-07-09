class LoggingServiceBase {
  log(message?: any, ...optionalParams: any[]) {
    console.log(message, optionalParams);
  }
}

export const LoggingService = new LoggingServiceBase();
