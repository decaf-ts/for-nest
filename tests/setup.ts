import { Decoration, DecorationKeys, Metadata } from "@decaf-ts/decoration";
import { RamFlavour } from "@decaf-ts/core";

// Ensure flavour metadata is initialized as arrays before any @uses decorators run.
Metadata.set(DecorationKeys.FLAVOUR, Decoration.defaultFlavour, []);
Metadata.set(DecorationKeys.FLAVOUR, RamFlavour, []);
