import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { USUARIO_PACKAGE } from './usuario.constants';
import { UsuariosController } from './usuarios.controller';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: USUARIO_PACKAGE,
        transport: Transport.GRPC,
        options: {
          package: 'usuario',
          protoPath: join(__dirname, '../../../proto/usuario.proto'),
          url: 'localhost:5000',
        },
      },
    ]),
  ],
  controllers: [UsuariosController],
})
export class UsuarioModule {}
