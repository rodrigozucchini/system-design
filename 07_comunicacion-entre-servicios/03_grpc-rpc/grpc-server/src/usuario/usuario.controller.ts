import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import type { GetUsuarioRequest, Usuario } from './usuario.interfaces';
import { UsuarioService } from './usuario.service';

// @Controller() sin ruta: no tiene sentido HTTP acá, este controller no
// escucha rutas — escucha llamadas gRPC despachadas por Transport.GRPC (main.ts).
@Controller()
export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  // Los dos strings tienen que matchear EXACTO el nombre del service y del
  // rpc en el .proto ('UsuarioService', 'GetUsuario'). Si no matchean, Nest
  // no lo conecta con ningún método del contrato y falla en runtime, no en compilación.
  @GrpcMethod('UsuarioService', 'GetUsuario')
  getUsuario(data: GetUsuarioRequest): Usuario {
    // Unary: 1 mensaje entra, 1 objeto sale — igual que un controller REST normal.
    return this.usuarioService.findById(data.id);
  }

  @GrpcMethod('UsuarioService', 'WatchUsuarios')
  watchUsuarios(): Observable<Usuario> {
    // Server streaming: alcanza con devolver el Observable tal cual. Nest se
    // encarga de traducir cada valor emitido en un mensaje del stream gRPC
    // porque el .proto declara este rpc como `returns (stream Usuario)`.
    return this.usuarioService.watch();
  }
}
