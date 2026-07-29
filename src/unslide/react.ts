import type { ReactElement } from "react";

/** A synchronous report entry that receives no props. */
export type ReportComponent = () => ReactElement;
/** Supported default exports from a React report source module. */
export type ReportSource = ReactElement | ReportComponent;

export { default } from "react";
export { inlineAsset, readTextAsset } from "./assets.js";
