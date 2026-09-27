import { SetMetadata } from '@nestjs/common';

export const REQUIRED_MODULE_KEY = 'requiredModule';
export const RequiredModule = (moduleKey: string) => SetMetadata(REQUIRED_MODULE_KEY, moduleKey);
