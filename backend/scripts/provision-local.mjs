import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { readFileSync } from 'node:fs';
const email=process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase(),name=process.env.INITIAL_TENANT_NAME?.trim();
if(!email||!/^\S+@\S+\.\S+$/.test(email)||!name)throw new Error('Configure correo y nombre del negocio');
const password=readFileSync('/run/secrets/initial_admin_password','utf8').trim();
if(password.length<16)throw new Error('La contraseña inicial requiere al menos 16 caracteres');
const prisma=new PrismaClient();
try{
 const passwordHash=await bcrypt.hash(password,12);
 await prisma.$transaction(async tx=>{
  await tx.$queryRawUnsafe("SELECT 1 FROM pg_advisory_xact_lock(hashtextextended('FERRE_PROVISION_LOCAL',0))");
  if(await tx.tenant.count()||await tx.usuario.count())throw new Error('La base ya tiene una empresa o usuarios. El alta inicial no modifica instalaciones existentes.');
  const tenant=await tx.tenant.create({data:{nombreComercial:name}});
  await tx.usuario.create({data:{tenantId:tenant.id,nombre:'Administrador inicial',email,passwordHash,rol:'ADMIN'}});
 });
 console.log('Empresa y administrador inicial creados sin datos de demostración.');
}finally{await prisma.$disconnect();}
