import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import { Layer } from "effect";

/** Node capabilities used by the internal operational pipeline. */
export const applicationLayer = Layer.merge(
  NodeFileSystem.layer,
  NodePath.layer,
);
