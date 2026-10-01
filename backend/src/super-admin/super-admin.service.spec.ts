import { Test } from '@nestjs/testing';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SuperAdminService - Diagnostic & Audit Test', () => {
  let service: SuperAdminService;
  let prismaService: any;
  let jwtService: any;
  let configService: any;

  beforeEach(async () => {
    prismaService = {
      superAdmin: {
        findUnique: vi.fn(),
      },
    };
    jwtService = {
      sign: vi.fn().mockReturnValue('mock_token'),
    };
    configService = {
      get: vi.fn((key: string, defaultValue?: string) => defaultValue || 'mock_value'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get<SuperAdminService>(SuperAdminService);
  });

  it('FAIL SCENARIO: If password in DB is plain text "FerreSuperAdmin2026!", bcrypt.compare returns false and service throws 401 UnauthorizedException', async () => {
    const rawPlainPasswordInDb = 'FerreSuperAdmin2026!';
    prismaService.superAdmin.findUnique.mockResolvedValue({
      id: 'sa-1',
      nombre: 'Super Admin',
      email: 'admin@ferresystem.hn',
      passwordHash: rawPlainPasswordInDb, // Plaintext stored in DB instead of bcrypt hash
      activo: true,
    });

    const mockRes: any = { cookie: vi.fn() };

    await expect(
      service.login({ email: 'admin@ferresystem.hn', password: 'FerreSuperAdmin2026!' }, mockRes),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('PASS SCENARIO: If password in DB is a valid bcrypt hash of "FerreSuperAdmin2026!", bcrypt.compare returns true and login succeeds', async () => {
    const validBcryptHash = await bcrypt.hash('FerreSuperAdmin2026!', 10);
    prismaService.superAdmin.findUnique.mockResolvedValue({
      id: 'sa-1',
      nombre: 'Super Admin',
      email: 'admin@ferresystem.hn',
      passwordHash: validBcryptHash,
      activo: true,
    });

    const mockRes: any = { cookie: vi.fn() };

    const result = await service.login(
      { email: 'admin@ferresystem.hn', password: 'FerreSuperAdmin2026!' },
      mockRes,
    );

    expect(result).toHaveProperty('accessToken', 'mock_token');
    expect(result.superAdmin).toEqual({
      id: 'sa-1',
      nombre: 'Super Admin',
      email: 'admin@ferresystem.hn',
    });
    expect(mockRes.cookie).toHaveBeenCalled();
  });

  it('FAIL SCENARIO: If superAdmin active flag is false, login fails with UnauthorizedException', async () => {
    const validBcryptHash = await bcrypt.hash('FerreSuperAdmin2026!', 10);
    prismaService.superAdmin.findUnique.mockResolvedValue({
      id: 'sa-1',
      nombre: 'Super Admin',
      email: 'admin@ferresystem.hn',
      passwordHash: validBcryptHash,
      activo: false,
    });

    const mockRes: any = { cookie: vi.fn() };

    await expect(
      service.login({ email: 'admin@ferresystem.hn', password: 'FerreSuperAdmin2026!' }, mockRes),
    ).rejects.toThrow(UnauthorizedException);
  });
});
