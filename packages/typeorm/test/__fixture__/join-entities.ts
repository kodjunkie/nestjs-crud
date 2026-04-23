import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('jr_user')
export class JrUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  email: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'int', nullable: true })
  profileId: number | null;

  @OneToOne('JrProfile')
  @JoinColumn({ name: 'profileId' })
  profile: any;

  @OneToMany('JrProject', (p: any) => p.user)
  projects: any[];
}

@Entity('jr_profile')
export class JrProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bio: string | null;

  @OneToMany('JrLicense', (l: any) => l.profile)
  licenses: any[];
}

@Entity('jr_license')
export class JrLicense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'int', nullable: true })
  profileId: number | null;

  @ManyToOne(() => JrProfile, (p) => p.licenses)
  @JoinColumn({ name: 'profileId' })
  profile: JrProfile;
}

@Entity('jr_project')
export class JrProject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => JrUser, (u) => u.projects)
  @JoinColumn({ name: 'userId' })
  user: JrUser;

  @OneToMany('JrTask', (t: any) => t.project)
  tasks: any[];
}

@Entity('jr_task')
export class JrTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'int', nullable: true })
  projectId: number | null;

  @ManyToOne(() => JrProject, (p) => p.tasks)
  @JoinColumn({ name: 'projectId' })
  project: JrProject;
}
