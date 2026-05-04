import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { DecafRequestContext } from "./DecafRequestContext";

@Injectable()
export class DecafResponseInterceptor implements NestInterceptor {
  constructor(protected ctx: DecafRequestContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    let response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap((data) => {
        response = this.ctx.ctx.toResponse(response);
      })
    );
  }
}
