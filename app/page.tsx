"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Cpu, Database, Gauge, Server, SlidersHorizontal } from "lucide-react";
import { useConfig } from "@/hooks/use-config";
import { calculate, compactRub, formatRub } from "@/lib/calculator";

const costLabels: Record<string,string> = {
  equipment:"Оборудование",fitout:"Ввод в эксплуатацию",contingency:"Резерв бюджета",support:"Поддержка",
  electricity:"Электроэнергия",placement:"Размещение",networkStorage:"Сеть и хранилище",operations:"Эксплуатация",residual:"Остаточная стоимость"
};

export default function CalculatorPage(){
  const {config,loaded} = useConfig();
  const [taskIds,setTaskIds] = useState(["contracts","estimates","incidents","agents"]);
  const [modelId,setModelId] = useState<"auto"|string>("auto");
  const [gpuId,setGpuId] = useState<"auto"|string>("auto");
  const [hours,setHours] = useState(360);
  const [years,setYears] = useState(3);
  const [concurrency,setConcurrency] = useState(8);
  const [reserveMode,setReserveMode] = useState<"none"|"nplus1">("none");
  const [largeShare,setLargeShare] = useState(100);
  const [priority,setPriority] = useState<"cost"|"balance"|"quality">("balance");
  const [initialized,setInitialized] = useState(false);
  const [detailTab,setDetailTab] = useState<"alternatives"|"costs"|"rejected">("alternatives");

  useEffect(()=>{
    if(loaded&&!initialized){
      setHours(config.assumptions.defaultHoursMonth);
      setYears(config.assumptions.defaultYears);
      setConcurrency(config.assumptions.defaultConcurrency);
      setInitialized(true);
    }
  },[loaded,initialized,config.assumptions]);

  const input = useMemo(()=>({taskIds,modelId,gpuId,hoursMonth:hours,years,concurrency,reserveMode,largeModelSharePct:largeShare,priority}),[taskIds,modelId,gpuId,hours,years,concurrency,reserveMode,largeShare,priority]);
  const result = useMemo(()=>calculate(config,input),[config,input]);
  const maxCost = Math.max(result.buyTco,result.rentTco,1);
  const toggleTask=(id:string)=>setTaskIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
  const tasks=config.tasks.filter(t=>t.enabled);
  const models=config.models.filter(m=>m.enabled);
  const gpus=config.gpus.filter(g=>g.enabled);

  return <main className="page-shell">
    <div className="page-heading">
      <div><div className="eyebrow"><SlidersHorizontal size={15}/>Управленческий калькулятор</div><h1>GPU-инфраструктура для корпоративных задач</h1></div>
      <p>Выберите задачи и профиль нагрузки. Калькулятор проверит возможности моделей, предложит оборудование и сравнит аренду с покупкой.</p>
    </div>
    <div className="workspace-grid">
      <section className="stack">
        <div className="panel panel-body">
          <div className="panel-head"><span className="step">1</span><div><h2>Какие задачи требуется решать</h2><p>Выбор определяет возможности, контекст и минимальный уровень модели</p></div></div>
          <div className="task-grid">{tasks.map(task=>{
            const active=taskIds.includes(task.id);
            return <button key={task.id} className={`task-card ${active?"active":""}`} onClick={()=>toggleTask(task.id)} aria-pressed={active}>
              <span><span className="task-title">{task.title}</span><span className="task-desc">{task.description}</span><span className="task-category">{task.category}</span></span>
              <span className="check-box">{active&&<Check size={13}/>}</span>
            </button>})}</div>
        </div>

        <div className="panel panel-body">
          <div className="panel-head"><span className="step">2</span><div><h2>Модель и оборудование</h2><p>Автоматический подбор можно заменить ручным сценарием</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Модель</span><select className="control" value={modelId} onChange={e=>setModelId(e.target.value)}><option value="auto">Автовыбор по задачам</option>{models.map(model=><option value={model.id} key={model.id}>{model.name}</option>)}</select><small>{modelId==="auto"?`${result.eligibleModels.length} моделей прошли требования`:`Ручной выбор позволяет проверить альтернативный сценарий`}</small></label>
            <label className="field"><span>Ускоритель</span><select className="control" value={gpuId} onChange={e=>setGpuId(e.target.value)}><option value="auto">Рекомендованный для модели</option>{gpus.map(gpu=><option value={gpu.id} key={gpu.id}>{gpu.vendor} {gpu.name}</option>)}</select><small>{result.gpu.memoryGb} ГБ · {result.gpu.interconnect}</small></label>
            <div className="field full"><span>Использование вычислений в месяц</span><div className="range-row"><input type="range" min="40" max="730" step="10" value={hours} onChange={e=>setHours(+e.target.value)}/><span className="range-value">{hours} ч</span></div><div className="range-scale"><span>Пилот: 40</span><span>Базовый: 360</span><span>24×7: 730</span></div></div>
            <div className="field"><span>Пиковая параллельность</span><div className="range-row"><input type="range" min="1" max="64" step="1" value={concurrency} onChange={e=>setConcurrency(+e.target.value)}/><span className="range-value">{concurrency}</span></div><small>Одновременно выполняемые сложные запросы</small></div>
            <div className="field"><span>Доля запросов большой модели</span><div className="range-row"><input type="range" min="5" max="100" step="5" value={largeShare} onChange={e=>setLargeShare(+e.target.value)}/><span className="range-value">{largeShare}%</span></div><small>Остальные запросы направляются в экономичные модели</small></div>
            <div className="field"><span>Горизонт расчёта</span><select className="control" value={years} onChange={e=>setYears(+e.target.value)}>{[1,2,3,4,5].map(y=><option key={y} value={y}>{y} {y===1?"год":y<5?"года":"лет"}</option>)}</select></div>
            <div className="field"><span>Резервирование</span><div className="radio-row"><button className={`radio-button ${reserveMode==="none"?"active":""}`} onClick={()=>setReserveMode("none")}>Без резерва</button><button className={`radio-button ${reserveMode==="nplus1"?"active":""}`} onClick={()=>setReserveMode("nplus1")}>N+1 узел</button></div></div>
            <div className="field full"><span>Приоритет автоматического выбора</span><div className="radio-row"><button className={`radio-button ${priority==="cost"?"active":""}`} onClick={()=>setPriority("cost")}>Минимальная стоимость</button><button className={`radio-button ${priority==="balance"?"active":""}`} onClick={()=>setPriority("balance")}>Баланс</button><button className={`radio-button ${priority==="quality"?"active":""}`} onClick={()=>setPriority("quality")}>Максимум качества</button></div></div>
          </div>
        </div>

        <div className="panel panel-body">
          <div className="panel-head"><span className="step">3</span><div><h2>Требования, сформированные по задачам</h2><p>Параметры объясняют, почему модели допускаются или исключаются</p></div></div>
          <div className="metric-grid" style={{marginTop:16}}>
            <div className="metric"><span>Минимальный уровень</span><b>{result.requiredLevel} из 5</b><small>Управляемое правило каталога</small></div>
            <div className="metric"><span>Минимальный контекст</span><b>{result.requiredContextK} тыс.</b><small>токенов</small></div>
            <div className="metric"><span>Обязательные возможности</span><b>{result.requiredCapabilities.length}</b><small>{result.requiredCapabilities.join(", ")||"текст"}</small></div>
            <div className="metric"><span>Допущено моделей</span><b>{result.eligibleModels.length}</b><small>из {models.length} активных</small></div>
          </div>
        </div>
      </section>

      <aside className="stack sticky-results">
        <div className="result-hero">
          <div className="result-kicker">Рекомендуемая конфигурация</div><h2>{result.model.name}</h2><p className="result-note">{result.model.note}</p>
          <div className="spec-grid"><div><span>ПАРАМЕТРЫ</span><b>{result.model.totalParamsB>=1000?`${result.model.totalParamsB/1000} трлн`:`${result.model.totalParamsB} млрд`}</b></div><div><span>АКТИВНО</span><b>{result.model.activeParamsB} млрд</b></div><div><span>КОНТЕКСТ</span><b>{result.model.contextK} тыс.</b></div><div><span>ФОРМАТ</span><b>{result.model.precision}</b></div></div>
          <div className="hardware"><div className="hardware-icon"><Server size={22}/></div><div className="hardware-copy"><small>ОБОРУДОВАНИЕ</small><strong>{result.gpuCount}× {result.gpu.name}</strong><span>{result.nodes} узл. · куплено {result.purchasedGpuCount} GPU · {result.availableMemoryGb.toLocaleString("ru-RU")} ГБ</span></div></div>
          <span className="evidence">{result.model.evidence}</span>
        </div>

        <div className="panel cost-card">
          <div className="card-title-row"><h3>Сравнение на {years*12} месяцев</h3><span className={`decision ${result.decision}`}>{result.decision==="buy"?"Покупка выгоднее":"Аренда выгоднее"}</span></div>
          <div className="cost-comparison">
            <div className="cost-line"><div className="cost-line-top"><span>Покупка и владение</span><b>{compactRub(result.buyTco)}</b></div><div className="bar"><i style={{width:`${result.buyTco/maxCost*100}%`}}/></div><small>{compactRub(result.buyMonthlyAverage)} в среднем за месяц</small></div>
            <div className="cost-line rent"><div className="cost-line-top"><span>Аренда</span><b>{compactRub(result.rentTco)}</b></div><div className="bar"><i style={{width:`${result.rentTco/maxCost*100}%`}}/></div><small>{compactRub(result.rentMonthly)} в месяц при заданной загрузке</small></div>
          </div>
          <div className="break-even"><span>Порог целесообразности покупки</span><strong>{result.breakEvenHoursMonth?`${Math.round(result.breakEvenHoursMonth)} ч/мес.`:"нет"}</strong><small>Расчёт учитывает поддержку, площадку, эксплуатацию, электроэнергию и остаточную стоимость.</small></div>
        </div>

        <div className="metric-grid"><div className="metric"><span>GPU в рабочей нагрузке</span><b>{result.gpuCount}</b><small>{result.replicas} экземпляр(а) модели</small></div><div className="metric"><span>Требуется памяти</span><b>{Math.round(result.requiredMemoryGb).toLocaleString("ru-RU")} ГБ</b><small>веса и заданный запас</small></div><div className="metric"><span>Электроэнергия</span><b>{compactRub(result.monthlyPowerRub)}</b><small>в месяц</small></div><div className="metric"><span>Цена GPU-часа</span><b>{formatRub(result.gpu.rentPerGpuHourRub)}</b><small>{result.gpu.priceKind}</small></div></div>

        <div className="panel detail-card"><div className="detail-tabs"><button className={detailTab==="alternatives"?"active":""} onClick={()=>setDetailTab("alternatives")}>Подходящие</button><button className={detailTab==="costs"?"active":""} onClick={()=>setDetailTab("costs")}>Состав TCO</button><button className={detailTab==="rejected"?"active":""} onClick={()=>setDetailTab("rejected")}>Исключённые</button></div><div className="detail-content">
          {detailTab==="alternatives"?<div className="alternative-list">{result.alternatives.length?result.alternatives.map(item=><div className="alternative" key={item.model.id}><b>{item.model.name}</b><span>{item.gpu.name} · {item.model.minGpuCount} GPU · {item.model.evidence}</span><strong>{formatRub(item.hourlyInfrastructureRub)}/ч</strong></div>):<p className="task-desc">Нет модели, удовлетворяющей всем правилам. Измените требования на странице параметров.</p>}</div>:detailTab==="costs"?<div className="breakdown-list">{Object.entries(result.buy).filter(([k])=>k!=="total").map(([key,value])=><div className="breakdown-row" key={key}><span>{costLabels[key]}</span><b>{key==="residual"&&value>0?"− ":""}{compactRub(value)}</b></div>)}</div>:<div className="alternative-list">{Object.entries(result.rejectedReasons).slice(0,8).map(([id,reasons])=>{const rejected=config.models.find(m=>m.id===id);return <div className="alternative" key={id}><b>{rejected?.name??id}</b><span>{reasons.join("; ")}</span></div>})}</div>}
        </div></div>

        <div className="management-note"><b>Управленческий вывод</b><p>{result.decision==="buy"?`При заданной загрузке собственная платформа дешевле аренды на горизонте ${years} лет. До закупки требуется подтвердить цены коммерческими предложениями и провести нагрузочное испытание на целевых задачах.`:`При заданной загрузке аренда снижает финансовый риск. Покупка становится рациональной примерно от ${result.breakEvenHoursMonth?Math.round(result.breakEvenHoursMonth):"расчётного"} часов в месяц либо при обязательном закрытом контуре данных.`}</p></div>
      </aside>
    </div>
    <footer className="footer-note"><span>Предварительная инвестиционная модель. Значения с пометкой «оценка» требуется заменить данными коммерческих предложений.</span><span>Редакция параметров: {new Date(config.updatedAt).toLocaleDateString("ru-RU")}</span></footer>
  </main>;
}
