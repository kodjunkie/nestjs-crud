import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('translator_test')
export class TranslatorEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'int', nullable: true })
  age: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
