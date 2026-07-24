// Doubao-pp 运行时命令注册表（P0）
//
// 同构于 Deepseek-pp 的 runtime-command-registry.ts：保留全部调度原语
// （defineRuntimeCommandHandler / definePayloadlessRuntimeCommandHandler /
// createRuntimeCommandRegistry / 未知命令响应）。
//
// 适配点：Deepseek 版从多个领域契约文件（persistence / tool / deepseek /
// background-runtime-contracts）聚合 TypedRuntimeCommandContracts；Doubao 的
// P0 契约全部内聚在 runtime-command-contracts.ts 中，故此处仅从其导入，避免引入
// 豆包尚未移植的领域契约文件，保持可搬运性审计清晰。

import type {
  RuntimeMessageContext,
  RuntimeMessageEnvelope,
} from './runtime-boundary.ts';
import {
  CLIENT_ONLY_RUNTIME_COMMAND_TYPES,
  TYPED_RUNTIME_COMMAND_TYPES,
  getRuntimeCommandOwner,
} from './runtime-command-contracts.ts';
import type { RuntimeCommandContracts } from './runtime-command-contracts.ts';

export {
  CLIENT_ONLY_RUNTIME_COMMAND_TYPES,
  RUNTIME_COMMAND_CONTRACTS,
  TYPED_RUNTIME_COMMAND_TYPES,
  getRuntimeCommandOwner,
} from './runtime-command-contracts.ts';
export type { RuntimeCommandOwner } from './runtime-command-contracts.ts';

type MaybePromise<T> = T | Promise<T>;

export const RUNTIME_COMMAND_ERROR_CODES = {
  unknownCommand: 'runtime_command_unknown',
} as const;

export type TypedRuntimeCommandContracts = RuntimeCommandContracts;
export type TypedRuntimeCommandType = keyof TypedRuntimeCommandContracts;
export type TypedRuntimeCommandRequest<TType extends TypedRuntimeCommandType> =
  TypedRuntimeCommandContracts[TType]['request'];
export type TypedRuntimeCommandResponse<TType extends TypedRuntimeCommandType> =
  TypedRuntimeCommandContracts[TType]['response'];

export interface RuntimeCommandHandler<
  TType extends TypedRuntimeCommandType = TypedRuntimeCommandType,
> {
  readonly type: TType;
  handle(
    message: RuntimeMessageEnvelope,
    context: RuntimeMessageContext,
  ): Promise<TypedRuntimeCommandResponse<TType>>;
}

export interface RuntimeCommandRegistry {
  readonly types: readonly string[];
  dispatch(
    message: RuntimeMessageEnvelope,
    context: RuntimeMessageContext,
  ): Promise<unknown>;
}

export function defineRuntimeCommandHandler<
  TType extends TypedRuntimeCommandType,
  TDecoded = TypedRuntimeCommandRequest<TType>,
>(definition: {
  readonly type: TType;
  decode(message: RuntimeMessageEnvelope): TDecoded;
  handle(
    request: TDecoded,
    context: RuntimeMessageContext,
  ): MaybePromise<TypedRuntimeCommandResponse<TType>>;
}): RuntimeCommandHandler<TType> {
  return {
    type: definition.type,
    async handle(message, context) {
      if (message.type !== definition.type) {
        throw new Error(
          `Runtime command handler ${definition.type} received ${message.type}.`,
        );
      }
      const request = definition.decode(message);
      return definition.handle(request, context);
    },
  };
}

export function definePayloadlessRuntimeCommandHandler<
  TType extends TypedRuntimeCommandType,
>(
  type: TType,
  handle: (
    context: RuntimeMessageContext,
  ) => MaybePromise<TypedRuntimeCommandResponse<TType>>,
): RuntimeCommandHandler<TType> {
  return defineRuntimeCommandHandler({
    type,
    decode: () => undefined,
    handle: (_request, context) => handle(context),
  });
}

export function createRuntimeCommandRegistry(options: {
  typedHandlers: readonly RuntimeCommandHandler[];
}): RuntimeCommandRegistry {
  const handlersByType = new Map<string, RuntimeCommandHandler>();
  for (const handler of options.typedHandlers) {
    if (handlersByType.has(handler.type)) {
      throw new Error(`Duplicate runtime command handler: ${handler.type}`);
    }
    if (getRuntimeCommandOwner(handler.type) !== 'typed-handler') {
      throw new Error(`Runtime command is not owned by the typed registry: ${handler.type}`);
    }
    handlersByType.set(handler.type, handler);
  }
  for (const type of TYPED_RUNTIME_COMMAND_TYPES) {
    if (!handlersByType.has(type)) {
      throw new Error(`Missing typed runtime command handler: ${type}`);
    }
  }
  const types = Object.freeze([...TYPED_RUNTIME_COMMAND_TYPES]);

  return Object.freeze({
    types,
    async dispatch(message: RuntimeMessageEnvelope, context: RuntimeMessageContext) {
      const owner = getRuntimeCommandOwner(message.type);
      if (owner === 'typed-handler') {
        return handlersByType.get(message.type)!.handle(message, context);
      }
      return createUnknownRuntimeCommandResponse();
    },
  });
}

export function createUnknownRuntimeCommandResponse(): {
  ok: false;
  error: typeof RUNTIME_COMMAND_ERROR_CODES.unknownCommand;
} {
  return {
    ok: false,
    error: RUNTIME_COMMAND_ERROR_CODES.unknownCommand,
  };
}
