import { SetMetadata } from '@nestjs/common';

export const REQUIRED_MODULE_KEY = 'requiredModule';
export const RequiredModule = (...moduleKeys: string[]) => SetMetadata(REQUIRED_MODULE_KEY, moduleKeys.length === 1 ? moduleKeys[0] : moduleKeys);

/** Shared lookup used by either operation; each consumer keeps its own role/permission rules. */
export const RequiredAnyModule = (...moduleKeys: string[]) => SetMetadata(REQUIRED_MODULE_KEY, { anyOf: moduleKeys });
