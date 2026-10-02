"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequiredModule = exports.REQUIRED_MODULE_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.REQUIRED_MODULE_KEY = 'requiredModule';
const RequiredModule = (moduleKey) => (0, common_1.SetMetadata)(exports.REQUIRED_MODULE_KEY, moduleKey);
exports.RequiredModule = RequiredModule;
//# sourceMappingURL=required-module.decorator.js.map