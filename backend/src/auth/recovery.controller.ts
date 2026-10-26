import { Body, Controller, Get, Post, Req, UseGuards, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { RecoveryService } from './recovery.service';
import { OrigenPermitidoGuard } from '../common/guards/origen-permitido.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActionDto, AdminResetDto, BootstrapMfaDto, BootstrapRequestDto, ChangePasswordDto, ConfirmMfaDto, EnrollMfaDto, ForcedChangeDto, RecoveryRequestDto, ResetDto, UnlockDto } from './dto/recovery.dto';
import { tokenHash } from './mfa';

@Controller('auth/security')
@UseGuards(OrigenPermitidoGuard)
export class RecoveryController {
  constructor(private readonly service: RecoveryService) {}
  @Post('mfa/bootstrap-request') @HttpCode(202)
  bootstrapRequest(@Body() dto: BootstrapRequestDto, @Req() req: Request) { return this.service.requestBootstrap(dto.usuario ?? dto.email ?? '', dto.password, req.ip); }
  @Post('mfa/bootstrap')
  async bootstrap(@Body() dto: BootstrapMfaDto, @Req() req: Request) {
    await this.service.limit(`bootstrap-confirm:${tokenHash(dto.token)}`, req.ip); return this.service.bootstrapMfa(dto.token, dto.currentPassword);
  }
  @Post('request') @HttpCode(202)
  request(@Body() dto: RecoveryRequestDto, @Req() req: Request) { return this.service.request(dto, req.ip); }
  @Post('reset') @HttpCode(200)
  async reset(@Body() dto: ResetDto, @Req() req: Request) {
    await this.service.limit(`reset:${tokenHash(dto.token)}`, req.ip); return this.service.reset(dto);
  }
  @Post('forced-change') @HttpCode(200)
  async forcedChange(@Body() dto: ForcedChangeDto, @Req() req: Request) {
    await this.service.limit(`forced-change:${tokenHash(dto.token)}`, req.ip); return this.service.forcedChange(dto);
  }
  @Post('verify-email') @HttpCode(200)
  async verify(@Body() dto: ActionDto, @Req() req: Request) {
    await this.service.limit(`verify:${tokenHash(dto.token)}`, req.ip); return this.service.verifyEmail(dto.token);
  }
  @Post('verification') @UseGuards(JwtAuthGuard)
  async verification(@Req() req: Request & { user: any }) {
    await this.service.limit(`verification:${req.user.sub}`, req.ip); return this.service.requestVerification(req.user);
  }
  @Post('change-password') @UseGuards(JwtAuthGuard)
  async change(@Body() dto: ChangePasswordDto, @Req() req: Request & { user: any }) {
    await this.service.limit(`change:${req.user.sub}`, req.ip); return this.service.change(req.user, dto);
  }
  @Post('admin-reset') @UseGuards(JwtAuthGuard)
  async adminReset(@Body() dto: AdminResetDto, @Req() req: Request & { user: any }) {
    await this.service.limit(`admin-reset:${req.user.sub}`, req.ip); return this.service.adminReset(req.user, dto);
  }
  @Post('unlock') @UseGuards(JwtAuthGuard) @HttpCode(200)
  async unlock(@Body() dto: UnlockDto, @Req() req: Request & { user: any }) {
    await this.service.limit(`unlock:${req.user.sub}`, req.ip); return this.service.unlock(req.user, dto);
  }
  @Get('locked') @UseGuards(JwtAuthGuard)
  locked(@Req() req: Request & { user: any }) { return this.service.locked(req.user); }
  @Post('mfa/enroll') @UseGuards(JwtAuthGuard)
  async enroll(@Body() dto: EnrollMfaDto, @Req() req: Request & { user: any }) {
    await this.service.limit(`enroll:${req.user.sub}`, req.ip); return this.service.enroll(req.user, dto.currentPassword);
  }
  @Post('mfa/confirm')
  async confirm(@Body() dto: ConfirmMfaDto, @Req() req: Request) {
    await this.service.limit(`mfa-confirm:${tokenHash(dto.token)}`, req.ip); return this.service.confirmMfa(dto);
  }
}
