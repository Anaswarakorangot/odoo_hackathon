export type RoleType = 'sales' | 'purchase' | 'manufacturing' | 'inventory' | 'owner';

export interface User {
  id: string;
  name: string;
  login_id: string;
  email: string;
  role: RoleType | null;
  is_system_admin: boolean;
  address?: string;
  mobile_number?: string;
  position?: string;
  photo_url?: string;
}

export interface LoginRequest {
  login_id: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  is_system_admin: boolean;
  role: string | null;
  user_id: string;
  name: string;
}

export interface SignupRequest {
  name: string;
  login_id: string;
  email: string;
  password: string;
  role: RoleType;
  // NOTE: is_system_admin is intentionally NOT included here.
  // System Administrators can only be created by existing System Administrators.
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationErrorResponse {
  detail: FieldError[];
}

export interface JWTPayload {
  sub: string;
  is_system_admin: boolean;
  role: string | null;
  exp: number;
}
