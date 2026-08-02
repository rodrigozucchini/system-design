import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'usuario',
        protoPath: join(__dirname, '../../proto/usuario.proto'),
        url: '0.0.0.0:5000',
      },
    },
  );
  await app.listen();
  console.log('grpc-server escuchando en 0.0.0.0:5000');
}
bootstrap();
