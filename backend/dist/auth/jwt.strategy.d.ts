import { ConfigService } from '@nestjs/config';
export interface JwtValidatedPayload {
    sub: string;
    email: string;
    rol: string;
    type: 'tenant' | 'super_admin';
    tenantId?: string;
}
declare const JwtStrategy_base: new (...args: unknown[]) => any;
export declare class JwtStrategy extends JwtStrategy_base {
    constructor(configService: ConfigService);
    validate(payload: any): Promise<JwtValidatedPayload>;
}
export {};
