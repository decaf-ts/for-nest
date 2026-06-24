import "@decaf-ts/logging";
import { logParameterRegistry } from "@decaf-ts/logging";

logParameterRegistry
  .register({
    key: "user",
    shouldInclude(payload) {
      return Boolean(payload.user);
    },
    render(payload) {
      return payload.user;
    },
    style(rendered, payload) {
      return payload.applyTheme(rendered, "app");
    },
  })
  .register({
    key: "organization",
    shouldInclude(payload) {
      return Boolean(payload.organization);
    },
    render(payload) {
      return payload.organization;
    },
    style(rendered, payload) {
      return payload.applyTheme(rendered, "app");
    },
  })
  .register({
    key: "ip",
    shouldInclude(payload) {
      return Boolean(payload.ip);
    },
    render(payload) {
      return payload.ip;
    },
    style(rendered, payload) {
      return payload.applyTheme(rendered, "id");
    },
  });
