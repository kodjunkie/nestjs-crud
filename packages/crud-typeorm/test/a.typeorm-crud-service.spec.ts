import { TypeOrmCrudService } from '../src/typeorm-crud.service';

describe('TypeOrmCrudService', () => {
  describe('#checkSqlInjection', () => {
    let service: any;

    beforeEach(() => {
      service = Object.create(TypeOrmCrudService.prototype);
      service.sqlInjectionRegEx = [
        /(%27)|(\')|(--)|(%23)|(#)/gi,
        /((%3D)|(=))[^\n]*((%27)|(\')|(--)|(%3B)|(;))/gi,
        /w*((%27)|(\'))((%6F)|o|(%4F))((%72)|r|(%52))/gi,
        /((%27)|(\'))union/gi,
      ];
      service.throwBadRequestException = (msg: string) => {
        throw new Error(msg);
      };
    });

    it('should detect SQL injection matching pattern 1 (quotes, comments)', () => {
      expect(() => service.checkSqlInjection("field'--")).toThrow('SQL injection detected');
    });

    it('should detect SQL injection matching pattern 2 (= followed by quotes/semicolons)', () => {
      expect(() => service.checkSqlInjection('field=%27;')).toThrow('SQL injection detected');
    });

    it('should detect SQL injection matching pattern 3 (OR keyword)', () => {
      expect(() => service.checkSqlInjection("w'or")).toThrow('SQL injection detected');
    });

    it('should detect SQL injection matching pattern 4 (UNION)', () => {
      expect(() => service.checkSqlInjection("'union")).toThrow('SQL injection detected');
    });

    it('should allow safe field names', () => {
      expect(service.checkSqlInjection('users.name')).toBe('users.name');
      expect(service.checkSqlInjection('id')).toBe('id');
      expect(service.checkSqlInjection('created_at')).toBe('created_at');
    });
  });
});
