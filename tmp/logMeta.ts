import "../src/decoration";
import "../src/overrides";
import { Metadata } from "@decaf-ts/decoration";
import { PersistenceKeys } from "@decaf-ts/core";
import { Product } from "../tests/unit/Product";

console.log("generated metadata", Metadata.get(Product)?.generated);
console.log(
  "persistence createdBy",
  Metadata.get(Product, PersistenceKeys.CREATED_BY)
);
console.log("persistence updatedBy", Metadata.get(Product, PersistenceKeys.UPDATED_BY));
