"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantId = void 0;
const common_1 = require("@nestjs/common");
exports.TenantId = (0, common_1.createParamDecorator)((_data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
        throw new common_1.UnauthorizedException('Tenant ID no encontrado en la sesión');
    }
    return tenantId;
});
//# sourceMappingURL=tenant-id.decorator.js.map