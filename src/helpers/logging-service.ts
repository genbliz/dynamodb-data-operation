class LoggingServiceBase {
  log(message?: any, ...optionalParams: any[]) {
    console.log(message);
  }
}

export const LoggingService = new LoggingServiceBase();
