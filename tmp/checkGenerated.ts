import "../src/decoration.ts";
import "../src/overrides/index.ts";
import { Product } from "../tests/unit/Product.ts";
import { Model } from "@decaf-ts/decorator-validation";

console.log("createdAt generated", Model.generated(Product, "createdAt"));
console.log("updatedAt generated", Model.generated(Product, "updatedAt"));
console.log("version generated", Model.generated(Product, "version"));
console.log("createdBy generated", Model.generated(Product, "createdBy"));
console.log("updatedBy generated", Model.generated(Product, "updatedBy"));
