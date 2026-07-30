import { config } from "./config.mjs";

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections?.();
  });
}

export function createShutdownController({
  server,
  runtimeState,
  closeDatabase,
  logger,
  exit = (code) => {
    process.exitCode = code;
  },
}) {
  let shutdownPromise = null;

  return async function shutdown(reason, error = null) {
    if (shutdownPromise) return shutdownPromise;

    runtimeState.shuttingDown = true;
    runtimeState.shutdownReason = reason;

    shutdownPromise = (async () => {
      logger.log(error ? "error" : "info", "app_shutdown_started", {
        event: "app_shutdown_started",
        reason,
        error,
      });

      const gracefulWork = (async () => {
        await closeHttpServer(server);
        await closeDatabase();
      })();

      let timeoutId;
      const shutdownTimeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error(
            `Graceful shutdown exceeded ${config.shutdownTimeoutMs}ms`
          );
          timeoutError.code = "SHUTDOWN_TIMEOUT";
          reject(timeoutError);
        }, config.shutdownTimeoutMs);
      });

      try {
        await Promise.race([gracefulWork, shutdownTimeout]);
        logger.info("app_shutdown_completed", {
          event: "app_shutdown_completed",
          reason,
        });
        exit(error ? 1 : 0);
      } catch (shutdownError) {
        server.closeAllConnections?.();
        logger.error("app_shutdown_failed", {
          event: "app_shutdown_failed",
          reason,
          error: shutdownError,
        });
        exit(1);
      } finally {
        clearTimeout(timeoutId);
        logger.close();
      }
    })();

    return shutdownPromise;
  };
}

export function installProcessHandlers({ shutdown, logger }) {
  const onSigterm = () => void shutdown("SIGTERM");
  const onSigint = () => void shutdown("SIGINT");
  const onUncaughtException = (error) => {
    logger.error("uncaught_exception", {
      event: "uncaught_exception",
      severity: "critical",
      process: process.pid,
      node_version: process.version,
      uptime_sec: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      error,
    });
    void shutdown("uncaughtException", error);
  };
  const onUnhandledRejection = (reason) => {
    const error =
      reason instanceof Error ? reason : new Error(String(reason ?? "unknown"));
    logger.error("unhandled_rejection", {
      event: "unhandled_rejection",
      error,
    });
    void shutdown("unhandledRejection", error);
  };

  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);
  process.once("uncaughtException", onUncaughtException);
  process.once("unhandledRejection", onUnhandledRejection);

  return () => {
    process.removeListener("SIGTERM", onSigterm);
    process.removeListener("SIGINT", onSigint);
    process.removeListener("uncaughtException", onUncaughtException);
    process.removeListener("unhandledRejection", onUnhandledRejection);
  };
}
