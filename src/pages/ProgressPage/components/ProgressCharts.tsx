import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, Target, TrendingUp, Flame, BookOpen, Sparkles } from 'lucide-react';

// ── Props ──
interface ProgressChartsProps {
  calendar: { date: string; checkedIn: boolean; minutes: number }[];
  stats: {
    streakDays: number;
    totalDays: number;
    moduleProgress: Record<string, number>;
  };
}

// ── Module config ──
const MODULE_COLORS = ['#00B894', '#1F2937', '#6366F1', '#F97316', '#EC4899'];
const MODULE_NAMES: Record<string, string> = {
  think: '思维训练',
  chunks: '语块训练',
  conversation: '对话练习',
  shadowing: '影子跟读',
  vocabulary: '词汇深度',
};

export default function ProgressCharts({ calendar, stats }: ProgressChartsProps) {
  // Chart data: last 7 days from real calendar
  const weekData = useMemo(() => {
    const days = [];
    const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const record = calendar.find((r) => r.date === dateStr);
      days.push({
        day: labels[d.getDay()],
        minutes: Math.round(record ? record.minutes : 0),
      });
    }
    return days;
  }, [calendar]);

  // Pie chart: module distribution
  const pieData = useMemo(() => {
    return Object.entries(stats.moduleProgress).map(([key, value], idx) => ({
      name: MODULE_NAMES[key] || key,
      value,
      color: MODULE_COLORS[idx],
    }));
  }, [stats.moduleProgress]);

  // Line chart: 30-day trend from real calendar data
  const trendData = useMemo(() => {
    const data = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const record = calendar.find((r) => r.date === dateStr);
      data.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        minutes: Math.round(record ? record.minutes : 0),
      });
    }
    return data;
  }, [calendar]);

  return (
    <div className="space-y-6">
      {/* 第一行：柱状图 + 饼图 */}
      <div className="grid grid-cols-12 gap-6">
        {/* 近 7 天学习时长柱状图 */}
        <Card className="col-span-12 lg:col-span-7 rounded-[40px] border-border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
                <BarChart3 className="size-5.5" />
              </div>
              <div>
                <CardTitle className="text-xl font-[900] italic text-foreground">
                  近 7 天学习时长
                </CardTitle>
                <CardDescription className="text-sm font-medium mt-1">
                  每日学习分钟数
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weekData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(215 28% 20%)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  unit="m"
                />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  formatter={(value: number) => [`${value} 分钟`, '学习时长']}
                />
                <Bar
                  dataKey="minutes"
                  fill="#00B894"
                  radius={[10, 10, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 各模块占比饼图 */}
        <Card className="col-span-12 lg:col-span-5 rounded-[40px] border-border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894] flex items-center justify-center">
                <Target className="size-5.5" />
              </div>
              <div>
                <CardTitle className="text-xl font-[900] italic text-foreground">
                  模块学习占比
                </CardTitle>
                <CardDescription className="text-sm font-medium mt-1">
                  各模块完成度分布
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  formatter={(value: number, name: string) => [`${value}%`, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontWeight: 700 }}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 第二行：折线图 + 暗色统计 */}
      <div className="grid grid-cols-12 gap-6">
        {/* 30天趋势折线图 */}
        <Card className="col-span-12 lg:col-span-8 rounded-[40px] border-border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-orange-50 dark:bg-orange-500/15 text-orange-500 flex items-center justify-center">
                <TrendingUp className="size-5.5" />
              </div>
              <div>
                <CardTitle className="text-xl font-[900] italic text-foreground">
                  学习趋势
                </CardTitle>
                <CardDescription className="text-sm font-medium mt-1">
                  近 30 天学习时长变化
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(215 28% 20%)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 12, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  unit="m"
                />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  formatter={(value: number) => [`${value} 分钟`, '学习时长']}
                />
                <Line
                  type="monotone"
                  dataKey="minutes"
                  stroke="#00B894"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#00B894', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 暗色迷你统计卡 */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card className="rounded-[32px] bg-[#1F2937] border-none shadow-xl relative overflow-hidden group">
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Total Streak
                </span>
                <Flame className="size-5 text-orange-400" />
              </div>
              <p className="text-5xl font-black italic text-white tracking-tight mb-1">
                {stats.streakDays}
                <span className="text-lg font-black text-[#00B894] ml-1">天</span>
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                连续学习天数
              </p>
            </CardContent>
            <Sparkles className="absolute top-0 right-0 p-6 size-32 text-white opacity-5 group-hover:scale-110 transition-transform duration-700" />
          </Card>

          <Card className="rounded-[32px] border-border shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  累计学习
                </span>
                <BookOpen className="size-5 text-[#00B894]" />
              </div>
              <p className="text-4xl font-black italic text-foreground tracking-tight mb-1">
                {stats.totalDays}
                <span className="text-lg font-black text-[#00B894] ml-1">天</span>
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                坚持就是胜利 ✨
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
