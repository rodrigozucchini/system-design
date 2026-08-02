import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { Usuario } from './usuario.interfaces';

@Injectable()
export class UsuarioService {
  // "DB" en memoria — nada gRPC-específico, es un service Nest común.
  private readonly usuarios: Usuario[] = [
    { id: 1, nombre: 'Ada Lovelace', email: 'ada@example.com' },
    { id: 2, nombre: 'Alan Turing', email: 'alan@example.com' },
    { id: 3, nombre: 'Grace Hopper', email: 'grace@example.com' },
  ];

  findById(id: number): Usuario {
    const usuario = this.usuarios.find((u) => u.id === id);
    if (!usuario) {
      // RpcException, no NotFoundException: este service corre detrás de un
      // controller gRPC, no HTTP — NotFoundException no significaría nada acá,
      // el transporte gRPC no tiene status codes HTTP.
      throw new RpcException(`Usuario ${id} no existe`);
    }
    return usuario;
  }

  // Devuelve un Observable en vez de un array/promise: es lo que permite que
  // el controller lo declare como server streaming (ver usuario.controller.ts).
  // Cada subscriber.next() = un mensaje nuevo empujado por el stream gRPC.
  watch(): Observable<Usuario> {
    return new Observable((subscriber) => {
      let tick = 0;
      // El timer es solo para simular "algo cambió" — en un caso real acá
      // colgarías un listener de eventos reales (DB change, mensaje de cola, etc.)
      // y llamarías subscriber.next() cuando ocurra, no en un intervalo fijo.
      const interval = setInterval(() => {
        const usuario = this.usuarios[tick % this.usuarios.length];
        subscriber.next(usuario);
        tick += 1;
      }, 1500);

      // Cleanup: se ejecuta cuando el cliente cierra la conexión/stream.
      // Sin esto, el setInterval seguiría corriendo para siempre (memory/CPU leak).
      return () => clearInterval(interval);
    });
  }
}
