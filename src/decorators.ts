import { Inject } from "@nestjs/common";
import { Constructor } from "@decaf-ts/decoration";
import {
  injectableServiceKey,
  ModelService,
  Repository as CoreRepository,
  Service as CoreService,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";

export type DecafFactoryProvider = {
  provide: string;
  useFactory: () => unknown;
};

const pendingProviders = new Map<string, DecafFactoryProvider>();

/**
 * @description Drains the providers registered by {@link Service}/{@link Repository} usages.
 * @summary Consumed by {@link DecafCoreModule.forRoot} to wire the tokens that those parameter
 * decorators reference back into Nest's DI container, since a parameter decorator alone cannot
 * supply a provider.
 */
export function getRegisteredDecafProviders(): DecafFactoryProvider[] {
  return Array.from(pendingProviders.values());
}

function registerProvider(token: string, useFactory: () => unknown): void {
  if (pendingProviders.has(token)) return;
  pendingProviders.set(token, { provide: token, useFactory });
}

function isModelConstructor(value: unknown): value is Constructor<any> {
  return typeof value === "function" && value.prototype instanceof Model;
}

function modelServiceToken(model: Constructor<any>): string {
  return `${model.name}Service`;
}

function modelRepositoryToken(
  model: Constructor<any>,
  flavour?: string
): string {
  return flavour ? `${model.name}Repository@${flavour}` : `${model.name}Repository`;
}

/**
 * @description Constructor parameter decorator that injects a decaf service.
 * @summary Translates decaf's service resolution APIs into a Nest `@Inject()` call:
 * - `@Service(SomeModel)` injects the `ModelService<SomeModel>` singleton for that model
 *   (via {@link ModelService.forModel}).
 * - `@Service(SomeServiceClass)` or `@Service("alias")` injects the matching `@service()`-decorated
 *   decaf {@link CoreService} (via {@link CoreService.get}).
 * - `@Service()` infers the parameter's type from emitted constructor metadata and resolves it the
 *   same way, provided the parameter is typed as a concrete class (generics like `ModelService<X>`
 *   are erased at runtime, so the model-service form always requires an explicit argument).
 * @param key the model class, service class, or alias to resolve. Omit to infer from the parameter type.
 */
export function Service(key?: string | Constructor<any>): ParameterDecorator {
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ): void => {
    let resolved: string | Constructor<any> | undefined = key;
    if (typeof resolved === "undefined") {
      const paramTypes: any[] =
        Reflect.getMetadata("design:paramtypes", target) || [];
      resolved = paramTypes[parameterIndex];
    }
    if (typeof resolved === "undefined") {
      throw new Error(
        `@Service() could not determine an injection type for parameter ${parameterIndex} of ${(target as Constructor<any>).name}. Provide an explicit argument, e.g. @Service(SomeService).`
      );
    }

    const asModel = typeof resolved !== "string" && isModelConstructor(resolved);
    const token = asModel
      ? modelServiceToken(resolved as Constructor<any>)
      : injectableServiceKey(resolved as string | Constructor<any>);

    registerProvider(token, () => {
      if (asModel) return ModelService.forModel(resolved as Constructor<any>);
      return typeof resolved === "string"
        ? CoreService.get(resolved)
        : CoreService.get(resolved as Constructor<any>);
    });

    return Inject(token)(target, propertyKey, parameterIndex);
  };
}

/**
 * @description Constructor parameter decorator that injects a decaf {@link CoreRepository} for `model`.
 * @summary Unlike {@link Service}, `model` is always treated as a Model class: the same class passed
 * to `@Service(model)` and `@Repository(model)` resolves to two different injected objects (a
 * `ModelService<M>` vs a `Repository<M>` respectively), via {@link CoreRepository.forModel}.
 * @param model the model class to resolve a repository for.
 * @param flavour optional adapter flavour/alias, forwarded to {@link CoreRepository.forModel}.
 */
export function Repository(
  model: Constructor<any>,
  flavour?: string
): ParameterDecorator {
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ): void => {
    const token = modelRepositoryToken(model, flavour);
    registerProvider(token, () => CoreRepository.forModel(model, flavour));
    return Inject(token)(target, propertyKey, parameterIndex);
  };
}
