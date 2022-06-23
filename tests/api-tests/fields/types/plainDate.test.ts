import { plainDate } from '@keystone-6/core/fields';
import { orderableFilterTests, filterTests, uniqueEqualityFilterTest } from './utils';

for (const isNullable of [true, false]) {
  describe(`plainDate with isNullable: ${isNullable}`, () => {
    const values = ['1979-04-12', '1980-10-01', '1990-12-31', '2000-01-20', '2020-06-10'] as const;
    filterTests(plainDate({ db: { isNullable } }), match => {
      orderableFilterTests(match, values, isNullable);
    });
    uniqueEqualityFilterTest(plainDate({ db: { isNullable }, isIndexed: 'unique' }), values);
  });
}
