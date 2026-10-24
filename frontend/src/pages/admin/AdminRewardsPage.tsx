import { useCallback, useEffect, useState } from 'react';
import {
  createAdminPayoutMethod,
  getAdminPayoutMethods,
  getAdminRewardSettings,
  patchAdminPayoutMethod,
  patchAdminRewardSettings,
  type AdminPayoutMethod,
} from '../../api/admin';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { Button } from '@/components/admin/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card';
import { Checkbox } from '@/components/admin/ui/checkbox';
import { Input } from '@/components/admin/ui/input';
import { Skeleton } from '@/components/admin/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';

export function AdminRewardsPage() {
  const [enabled, setEnabled] = useState(true);
  const [methods, setMethods] = useState<AdminPayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState<'wallet_address' | 'telegram_account'>(
    'wallet_address',
  );
  const [newCurrency, setNewCurrency] = useState('TON');
  const [newAmount, setNewAmount] = useState('1');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, nextMethods] = await Promise.all([
        getAdminRewardSettings(),
        getAdminPayoutMethods(),
      ]);
      setEnabled(settings.enabled);
      setMethods(nextMethods);
      setMessage('');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '보상 설정을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = async (next: boolean) => {
    try {
      const saved = await patchAdminRewardSettings(next);
      setEnabled(saved.enabled);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '보상 스위치를 바꾸지 못했습니다.'));
    }
  };

  const addMethod = async () => {
    if (!newCode.trim() || !newLabel.trim()) return;
    try {
      await createAdminPayoutMethod({
        code: newCode.trim(),
        label: newLabel.trim(),
        destinationKind: newKind,
        currency: newCurrency.trim() || 'TON',
        defaultAmount: Number(newAmount) || 0,
        network: newKind === 'wallet_address' ? newCurrency.trim().toLowerCase() : undefined,
      });
      setNewCode('');
      setNewLabel('');
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '수단을 추가하지 못했습니다.'));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-xl font-bold">보상 설정</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        끄면 회원 제보 화면의 보상 안내만 숨깁니다. 제보는 계속 받습니다. 서버가 돈을 보내지는
        않습니다.
      </p>
      {message && <p className="mt-3 text-sm text-destructive">{message}</p>}

      {loading ? (
        <Skeleton className="mt-6 h-24 w-full" />
      ) : (
        <Card className="mt-6 py-4">
          <CardHeader className="px-4">
            <CardDescription>보상 전체</CardDescription>
            <CardTitle className="flex items-center gap-3 text-base">
              <Checkbox
                checked={enabled}
                onCheckedChange={(value) => void toggleEnabled(value === true)}
              />
              {enabled ? '켜짐' : '꺼짐'}
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      <section className="mt-8">
        <h3 className="text-sm font-semibold">지급 수단</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="코드 (ton)"
            className="w-32"
          />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="이름"
            className="w-40"
          />
          <select
            value={newKind}
            onChange={(e) =>
              setNewKind(e.target.value as 'wallet_address' | 'telegram_account')
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="wallet_address">지갑 주소</option>
            <option value="telegram_account">텔레그램 계정</option>
          </select>
          <Input
            value={newCurrency}
            onChange={(e) => setNewCurrency(e.target.value)}
            placeholder="통화"
            className="w-24"
          />
          <Input
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder="기본 금액"
            className="w-28"
          />
          <Button type="button" onClick={() => void addMethod()}>
            추가
          </Button>
        </div>
        <Card className="mt-4 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>코드</TableHead>
                <TableHead>받는 곳</TableHead>
                <TableHead>통화</TableHead>
                <TableHead>기본 금액</TableHead>
                <TableHead>사용</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell>
                    {row.destinationKind === 'telegram_account'
                      ? '텔레그램 계정'
                      : '지갑 주소'}
                  </TableCell>
                  <TableCell>{row.currency}</TableCell>
                  <TableCell>
                    <Input
                      defaultValue={String(row.defaultAmount)}
                      className="h-8 w-24"
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value) || value === row.defaultAmount) return;
                        void patchAdminPayoutMethod(row.id, { defaultAmount: value }).then(
                          () => load(),
                          (error) =>
                            setMessage(adminApiErrorMessage(error, '금액을 바꾸지 못했습니다.')),
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.enabled}
                      onCheckedChange={(value) => {
                        void patchAdminPayoutMethod(row.id, { enabled: value === true }).then(
                          () => load(),
                          (error) =>
                            setMessage(adminApiErrorMessage(error, '수단을 바꾸지 못했습니다.')),
                        );
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
