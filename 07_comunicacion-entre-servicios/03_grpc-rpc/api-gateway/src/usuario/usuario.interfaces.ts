import type { Observable } from 'rxjs';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
}

export interface UsuarioServiceClient {
  getUsuario(data: { id: number }): Observable<Usuario>;
  watchUsuarios(data: Record<string, never>): Observable<Usuario>;
}
