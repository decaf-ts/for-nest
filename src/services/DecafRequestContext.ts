import { Injectable, Scope } from "@nestjs/common";

@Injectable({ scope: Scope.REQUEST })
export class DecafRequestContext {
  private cache = new Map<string | symbol, any>();

  set(key: string | symbol, value: any) {
    this.cache.set(key, value);
  }

  get<T = any>(key: string | symbol): T | undefined {
    return this.cache.get(key);
  }
}
