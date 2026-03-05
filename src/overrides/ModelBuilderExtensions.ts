import "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { ModelBuilder } from "@decaf-ts/decorator-validation";
import { Auth } from "../decaf-model/decorators/decorators";

declare module "@decaf-ts/decorator-validation" {
  export interface ModelBuilder<M> {
    Auth(model: string | Constructor): ModelBuilder<M>;
    decorateClass(decorator: ClassDecorator): ModelBuilder<M>;
  }
}

const prototype = ModelBuilder.prototype as ModelBuilder<any> & {
  Auth: (model: string | Constructor) => ModelBuilder<any>;
};

if (!prototype.decorateClass) {
  prototype.decorateClass = function (decorator: ClassDecorator) {
    if (!(this as any)._classDecorators) {
      (this as any)._classDecorators = [];
    }
    (this as any)._classDecorators.push(decorator);
    return this;
  };
}

prototype.Auth = function (model: string | Constructor) {
  return this.decorateClass(Auth(model));
};

if (!(prototype as any).__hasClassDecoratorSupport) {
  const originalBuild = prototype.build;
  prototype.build = function () {
    let result = originalBuild.call(this);
    const decorators = (this as any)._classDecorators;
    if (decorators?.length) {
      for (const decorator of decorators) {
        const decorated = decorator(result as any) as typeof result | void;
        if (decorated) {
          result = decorated;
        }
      }
    }
    return result;
  };
  (prototype as any).__hasClassDecoratorSupport = true;
}
