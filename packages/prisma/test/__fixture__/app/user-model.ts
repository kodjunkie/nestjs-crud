export class UserModel {
  id!: number;

  email!: string;

  isActive!: boolean;

  deletedAt?: Date | null;
}
