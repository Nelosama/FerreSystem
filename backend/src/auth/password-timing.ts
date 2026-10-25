import * as bcrypt from 'bcrypt';
// Not attached to any account. Missing identifiers still perform the normal password work.
const dummyHash = bcrypt.hashSync('unassigned-security-timing-work-123456', 10);
export async function missingPasswordCheck(password: string) { await bcrypt.compare(password, dummyHash); }
