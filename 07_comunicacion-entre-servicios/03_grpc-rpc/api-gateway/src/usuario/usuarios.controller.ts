import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Sse,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, map, Observable } from 'rxjs';
import { USUARIO_PACKAGE } from './usuario.constants';
import type { Usuario, UsuarioServiceClient } from './usuario.interfaces';

// Este SÍ es un @Controller HTTP normal (con ruta '/usuarios') — el cliente
// externo (browser, curl, otro servicio) solo ve REST. gRPC queda escondido adentro.
@Controller('usuarios')
export class UsuariosController implements OnModuleInit {
  // El stub tipado del servicio remoto. No existe hasta onModuleInit —
  // por eso no se puede inicializar en el constructor.
  private usuarioService: UsuarioServiceClient;

  // @Inject(USUARIO_PACKAGE) trae el ClientGrpc que registramos en
  // usuario.module.ts (ClientsModule.register). Es la "conexión cruda" al
  // microservicio; todavía no sabe nada de nuestros métodos específicos.
  constructor(@Inject(USUARIO_PACKAGE) private readonly client: ClientGrpc) {}

  onModuleInit() {
    // getService lee el .proto ya cargado y genera el stub con los métodos
    // reales del contrato (getUsuario, watchUsuarios). El string tiene que
    // matchear el nombre del service en el .proto, igual que en @GrpcMethod.
    this.usuarioService =
      this.client.getService<UsuarioServiceClient>('UsuarioService');
  }

  // Server streaming: el stub devuelve un Observable que emite un valor por
  // cada mensaje que llega del stream gRPC. Lo mapeamos a la forma que pide
  // @Sse ({ data }) y Nest lo re-expone como Server-Sent Events por HTTP.
  //
  // Declarado antes que ':id' a propósito: Nest matchea rutas HTTP en orden
  // de declaración, no por especificidad — si esto fuera después, ':id'
  // capturaría "stream" como si fuera un id numérico y rompería con 400.
  @Sse('stream')
  streamUsuarios(): Observable<{ data: Usuario }> {
    return this.usuarioService
      .watchUsuarios({})
      .pipe(map((usuario) => ({ data: usuario })));
  }

  // Llamada unary: se ve y se usa igual que cualquier otro método async de
  // un service Nest. firstValueFrom espera el primer (y único) valor que
  // emita el Observable y lo convierte en Promise.
  @Get(':id')
  async getUsuario(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Usuario> {
    try {
      return await firstValueFrom(this.usuarioService.getUsuario({ id }));
    } catch (error) {
      // El RpcException del lado del server llega acá como un error de gRPC
      // (con .details/.message), no como una excepción HTTP — lo traducimos
      // a NotFoundException para que el cliente REST vea un 404 normal.
      throw new NotFoundException(error?.details ?? error?.message ?? error);
    }
  }
}
