		//#region dsh-account-usage-stats:账号页下方的本地用量统计（Token 统计 / 近 7 天用量 / 活跃度）
		/** 统计窗口的本地日历天数。 */
		const ACCOUNT_STATS_DAYS = 7
		/** 历史会话的投影必须由 host 侧回填后才会进入会话列表；同一浏览器每小时最多触发一次回填。 */
		const ACCOUNT_STATS_BACKFILL_KEY = "dsh-account-stats:backfill-at"
		const ACCOUNT_STATS_BACKFILL_INTERVAL = 60 * 60 * 1000
		/** 四种计费桶的展示顺序与配色（品牌蓝 + 固定色，浅/深色主题下都保有对比度）。 */
		const ACCOUNT_STATS_BUCKETS = [
			{ key: "input", label: "statsInput", color: "var(--dsw-alias-state-business-primary, #4d6bfe)" },
			{ key: "cacheRead", label: "statsCacheRead", color: "#14b8a6" },
			{ key: "cacheWrite", label: "statsCacheWrite", color: "#8b5cf6" },
			{ key: "output", label: "statsOutput", color: "#ec4899" }
		]
		/** 与既有账号卡片同材质：半像素描边、卡片圆角、设置卡片填充。 */
		const ACCOUNT_STATS_CARD = {
			display: "flex",
			flexDirection: "column",
			gap: 10,
			padding: "12px 16px",
			border: "0.5px solid var(--dsw-alias-settings-card-stroke)",
			borderRadius: "var(--dsw-radius-xl)",
			background: "var(--dsw-alias-settings-card-fill)"
		}
		const ACCOUNT_STATS_HEAD = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, minWidth: 0 }
		const ACCOUNT_STATS_TITLE = { fontSize: 14, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }
		const ACCOUNT_STATS_NOTE = { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }
		const ACCOUNT_STATS_BIG = { fontSize: 22, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", color: "var(--dsw-alias-label-primary)" }
		const ACCOUNT_STATS_MUTED = { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums" }
		const ACCOUNT_STATS_VALUE = { fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--dsw-alias-label-primary)", marginLeft: "auto" }

		/** 非负有限数才计数；任何杂质读作 0。 */
		function accountStatsCount(value) {
			return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
		}

		/** 与上下文插件一致的紧凑读数：1.2M / 345k / 980。 */
		function accountStatsFmt(value) {
			const n = accountStatsCount(value)
			if (n >= 1e9) return (n / 1e9).toFixed(1) + "B"
			if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"
			if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k"
			return String(Math.round(n))
		}

		function accountStatsShare(part, total) {
			if (!(total > 0) || !(part > 0)) return "0%"
			const pct = Math.min(100, (part / total) * 100)
			return pct < 0.1 ? "<0.1%" : pct.toFixed(pct >= 10 ? 0 : 1) + "%"
		}

		function accountStatsDayKeyOf(date) {
			return String(date.getFullYear()).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0")
		}

		/** 从今天往前 count 天的本地日期，旧到新；用日期字段运算，DST 长短日不会错位。 */
		function accountStatsWindow(count, now) {
			const days = []
			for (let i = count - 1; i >= 0; i--) {
				const date = new Date(now)
				date.setHours(12, 0, 0, 0)
				date.setDate(date.getDate() - i)
				days.push({ key: accountStatsDayKeyOf(date), day: date.getDate(), month: date.getMonth() + 1, today: i === 0 })
			}
			return days
		}

		function accountStatsEmpty(now) {
			return {
				total: 0,
				buckets: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
				bucketTotal: 0,
				requests: 0,
				hasUsage: false,
				sessions: 0,
				days: accountStatsWindow(ACCOUNT_STATS_DAYS, now).map((day) => ({ ...day, tokens: 0, requests: 0 })),
				weekTokens: 0,
				activeDays: 0,
				streak: 0,
				turns: 0,
				toolCalls: 0
			}
		}

		/**
		* 汇总会话列表快照里的投影：官方 `tokenUsage` 给累计四桶，`contextActivity` 给按天账本（含回合与工具调用）。
		* 所有读取逐行隔离；缺失或敌意的投影只会让它自己那一行不计数。
		*/
		function accountStatsOf(snapshot, now) {
			const days = accountStatsWindow(ACCOUNT_STATS_DAYS, now)
			const windowKeys = new Set(days.map((day) => day.key))
			const perDay = {}
			for (const day of days) perDay[day.key] = { tokens: 0, requests: 0 }
			const buckets = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
			let activityTotal = 0
			let requests = 0
			let turns = 0
			let toolCalls = 0
			let sessions = 0
			const state = snapshot !== null && typeof snapshot === "object" ? snapshot : null
			const byId = state !== null && state.byId !== null && typeof state.byId === "object" ? state.byId : null
			if (byId !== null) {
				for (const id of Object.keys(byId)) {
					const row = byId[id]
					if (row === null || typeof row !== "object") continue
					const values = row.projectionValues
					if (values === null || typeof values !== "object") continue
					sessions += 1
					try {
						const usage = values.tokenUsage
						if (usage !== null && typeof usage === "object") {
							buckets.input += accountStatsCount(usage.uncachedInputTokens)
							buckets.cacheRead += accountStatsCount(usage.cacheReadTokens)
							buckets.cacheWrite += accountStatsCount(usage.cacheWriteTokens)
							buckets.output += accountStatsCount(usage.outputTokens)
						}
						const activity = values.contextActivity
						const activityDays = activity !== null && typeof activity === "object" ? activity.days : null
						if (activityDays !== null && typeof activityDays === "object") {
							for (const key of Object.keys(activityDays)) {
								const day = activityDays[key]
								if (day === null || typeof day !== "object") continue
								const tokens = accountStatsCount(day.tokens)
								activityTotal += tokens
								if (!windowKeys.has(key)) continue
								perDay[key].tokens += tokens
								perDay[key].requests += accountStatsCount(day.requests)
								requests += accountStatsCount(day.requests)
								turns += accountStatsCount(day.turns)
								toolCalls += accountStatsCount(day.toolCalls)
							}
						} else {
							const stats = values.sessionStats
							if (stats !== null && typeof stats === "object") turns += accountStatsCount(stats.turns)
						}
					} catch { /* 一行读不出来，只损失这一行 */ }
				}
			}
			const bucketTotal = buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output
			// 没有官方四桶时退回活动账本总量，并把全部体积记入"输入"以便分段条仍能画出比例。
			const total = bucketTotal > 0 ? bucketTotal : activityTotal
			if (bucketTotal <= 0 && total > 0) buckets.input = total
			let weekTokens = 0
			let activeDays = 0
			for (const day of days) {
				const tokens = perDay[day.key].tokens
				weekTokens += tokens
				if (tokens > 0) activeDays += 1
			}
			let streak = 0
			for (let i = days.length - 1; i >= 0; i--) {
				if (perDay[days[i].key].tokens > 0) streak += 1
				else break
			}
			return {
				total,
				buckets,
				bucketTotal: bucketTotal > 0 ? bucketTotal : total,
				requests,
				hasUsage: total > 0,
				sessions,
				days: days.map((day) => ({ ...day, tokens: perDay[day.key].tokens, requests: perDay[day.key].requests })),
				weekTokens,
				activeDays,
				streak,
				turns,
				toolCalls
			}
		}

		/** 近 7 天每日用量柱：柱高按窗口最大值归一，今天满色，其余七成透明。 */
		function AccountUsageStatsBars({ stats }) {
			let max = 1
			for (const day of stats.days) if (day.tokens > max) max = day.tokens
			return react.createElement("div", { style: { display: "flex", alignItems: "stretch", gap: 6, height: 70 } },
				stats.days.map((day) => react.createElement("div", {
					key: day.key,
					role: "img",
					"aria-label": day.month + "/" + day.day + " " + accountStatsFmt(day.tokens) + " tokens",
					title: day.month + "/" + day.day + " · " + accountStatsFmt(day.tokens) + " tokens",
					style: { flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }
				}, [
					react.createElement("div", { key: "track", style: { width: "100%", flex: "1 1 auto", display: "flex", alignItems: "flex-end" } },
						react.createElement("div", {
							style: {
								width: "100%",
								borderRadius: 4,
								background: day.tokens > 0
									? "var(--dsw-alias-state-business-primary, #4d6bfe)"
									: "var(--dsw-alias-bg-skeleton)",
								opacity: day.tokens > 0 && !day.today ? 0.62 : 1,
								height: day.tokens > 0 ? Math.max(8, Math.round((day.tokens / max) * 100)) + "%" : "4px"
							}
						})),
					react.createElement("span", {
						key: "label",
						style: {
							fontSize: 11,
							lineHeight: "14px",
							fontWeight: day.today ? 600 : 400,
							color: day.today ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-tertiary)"
						}
					}, String(day.day))
				]))
			)
		}

		/** 近 7 天活跃度格：按当日用量分四档着色，今天描边。 */
		function AccountUsageStatsGrid({ stats }) {
			let max = 1
			for (const day of stats.days) if (day.tokens > max) max = day.tokens
			return react.createElement("div", { style: { display: "flex", alignItems: "stretch", gap: 6 } },
				stats.days.map((day) => {
					const level = day.tokens <= 0 ? 0 : Math.min(4, 1 + Math.floor((day.tokens / max) * 3.999))
					const alpha = [0, 20, 38, 62, 100][level]
					return react.createElement("div", {
						key: day.key,
						title: day.month + "/" + day.day + " · " + accountStatsFmt(day.tokens) + " tokens · " + day.requests + " req",
						style: {
							flex: "1 1 0",
							minWidth: 0,
							height: 24,
							borderRadius: 5,
							boxSizing: "border-box",
							background: level === 0
								? "var(--dsw-alias-bg-skeleton)"
								: "color-mix(in srgb, var(--dsw-alias-state-business-primary, #4d6bfe) " + alpha + "%, transparent)",
							border: day.today ? "1.5px solid var(--dsw-alias-state-business-primary, #4d6bfe)" : "1.5px solid transparent"
						}
					})
				})
			)
		}

		function AccountUsageStatsTokenCard({ stats, t }) {
			return react.createElement("div", { style: ACCOUNT_STATS_CARD }, [
				react.createElement("div", { key: "head", style: ACCOUNT_STATS_HEAD }, [
					react.createElement("span", { key: "title", style: ACCOUNT_STATS_TITLE }, t("statsTokenTitle")),
					react.createElement("span", { key: "scope", style: ACCOUNT_STATS_NOTE }, t("statsScope"))
				]),
				react.createElement("div", { key: "value", style: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" } }, [
					react.createElement("span", { key: "total", style: ACCOUNT_STATS_BIG }, accountStatsFmt(stats.total)),
					react.createElement("span", { key: "unit", style: ACCOUNT_STATS_MUTED }, t("statsTokensUnit"))
				]),
				react.createElement("div", {
					key: "bar",
					style: { display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--dsw-alias-bg-skeleton)" }
				}, ACCOUNT_STATS_BUCKETS.map((bucket) => react.createElement("div", {
					key: bucket.key,
					style: { flex: stats.buckets[bucket.key] + " 0 0", background: bucket.color }
				}))),
				react.createElement("div", {
					key: "legend",
					style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "4px 16px" }
				}, ACCOUNT_STATS_BUCKETS.map((bucket) => react.createElement("div", {
					key: bucket.key,
					style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }
				}, [
					react.createElement("span", {
						key: "dot",
						style: { width: 8, height: 8, borderRadius: 2, flex: "none", background: bucket.color }
					}),
					react.createElement("span", {
						key: "name",
						style: { ...ACCOUNT_STATS_MUTED, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
					}, t(bucket.label)),
					react.createElement("span", { key: "value", style: ACCOUNT_STATS_VALUE }, accountStatsFmt(stats.buckets[bucket.key])),
					react.createElement("span", {
						key: "share",
						style: { ...ACCOUNT_STATS_MUTED, width: 44, textAlign: "right" }
					}, accountStatsShare(stats.buckets[bucket.key], stats.bucketTotal))
				]))),
				react.createElement("div", { key: "requests", style: ACCOUNT_STATS_MUTED },
					t("statsRequests") + " " + accountStatsFmt(stats.requests))
			])
		}

		function AccountUsageStatsWeekCard({ stats, t }) {
			return react.createElement("div", { style: ACCOUNT_STATS_CARD }, [
				react.createElement("div", { key: "head", style: ACCOUNT_STATS_HEAD }, [
					react.createElement("span", { key: "title", style: ACCOUNT_STATS_TITLE }, t("statsWeekTitle")),
					react.createElement("span", { key: "note", style: ACCOUNT_STATS_NOTE }, accountStatsFmt(stats.weekTokens) + " " + t("statsTokensUnitShort"))
				]),
				react.createElement(AccountUsageStatsBars, { key: "bars", stats }),
				react.createElement("div", { key: "avg", style: ACCOUNT_STATS_MUTED },
					t("statsWeekAvg") + " " + accountStatsFmt(stats.weekTokens / ACCOUNT_STATS_DAYS) + " " + t("statsTokensUnitShort"))
			])
		}

		function AccountUsageStatsActivityCard({ stats, t }) {
			return react.createElement("div", { style: ACCOUNT_STATS_CARD }, [
				react.createElement("div", { key: "head", style: ACCOUNT_STATS_HEAD }, [
					react.createElement("span", { key: "title", style: ACCOUNT_STATS_TITLE }, t("statsActivityTitle")),
					react.createElement("span", { key: "note", style: ACCOUNT_STATS_NOTE },
						t("statsActiveDays") + " " + stats.activeDays + "/" + ACCOUNT_STATS_DAYS)
				]),
				react.createElement(AccountUsageStatsGrid, { key: "grid", stats }),
				react.createElement("div", {
					key: "facts",
					style: { display: "flex", gap: 16, flexWrap: "wrap", ...ACCOUNT_STATS_MUTED }
				}, [
					react.createElement("span", { key: "streak" }, t("statsStreak") + " " + stats.streak + " " + t("statsDaysUnit")),
					react.createElement("span", { key: "turns" }, t("statsTurns") + " " + accountStatsFmt(stats.turns)),
					react.createElement("span", { key: "tools" }, t("statsToolCalls") + " " + accountStatsFmt(stats.toolCalls))
				])
			])
		}

		/** 统计主体：只读会话列表快照，挂载时触发一次历史投影回填并延迟刷新列表。 */
		function AccountUsageStatsInner(props) {
			const useSessions = props.useSessions
			const t = props.t
			const refreshSessions = props.refreshSessions
			const snapshot = useSessions((state) => state)
			const [now, setNow] = react.useState(() => Date.now())
			react.useEffect(() => {
				// 跨过本地零点时窗口与"今天"标记要重算。
				const timer = setInterval(() => { setNow(Date.now()) }, 60 * 1000)
				return () => { clearInterval(timer) }
			}, [])
			react.useEffect(() => {
				let cancelled = false
				const timers = []
				try {
					const stored = globalThis.sessionStorage.getItem(ACCOUNT_STATS_BACKFILL_KEY)
					if (stored !== null && Date.now() - Number(stored) < ACCOUNT_STATS_BACKFILL_INTERVAL) return undefined
					globalThis.sessionStorage.setItem(ACCOUNT_STATS_BACKFILL_KEY, String(Date.now()))
				} catch { /* 无本地存储时每次都试一次 */ }
				const refreshLater = (delay) => {
					timers.push(setTimeout(() => {
						if (cancelled || typeof refreshSessions !== "function") return
						try { refreshSessions() } catch { /* 刷新失败就沿用当前快照 */ }
					}, delay))
				}
				const run = async () => {
					let ok = false
					try {
						const response = await fetch("api/dsh-context/backfill", { method: "POST" })
						ok = response.ok
					} catch { ok = false }
					if (!ok || cancelled) return
					// 回填在 host 侧分批完成；分几次拉取列表让新投影逐步进入。
					refreshLater(2000)
					refreshLater(8000)
					refreshLater(20000)
				}
				void run()
				return () => {
					cancelled = true
					for (const timer of timers) clearTimeout(timer)
				}
			}, [])
			const stats = react.useMemo(() => {
				try { return accountStatsOf(snapshot, now) } catch { return accountStatsEmpty(now) }
			}, [snapshot, now])
			if (!stats.hasUsage) {
				return react.createElement("div", { style: { ...ACCOUNT_STATS_CARD, marginTop: 16, ...ACCOUNT_STATS_MUTED } },
					t("statsEmpty"))
			}
			return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12, marginTop: 16 } }, [
				react.createElement(AccountUsageStatsTokenCard, { key: "token", stats, t }),
				react.createElement(AccountUsageStatsWeekCard, { key: "week", stats, t }),
				react.createElement(AccountUsageStatsActivityCard, { key: "activity", stats, t })
			])
		}

		/** 统计块自己的错误边界：读不到数据只让这块消失，账号与余额卡片照常。 */
		class AccountUsageStatsBoundary extends react.Component {
			constructor(props) {
				super(props)
				this.state = { failed: false }
			}
			static getDerivedStateFromError() {
				return { failed: true }
			}
			componentDidCatch(error) {
				try { console.error("dsh-account-usage-stats:", error) } catch { /* 控制台不可用就算了 */ }
			}
			render() {
				return this.state.failed ? null : this.props.children
			}
		}

		/** 框架不提供会话列表标准钩子（或没有本地文案）时整块不渲染。 */
		function AccountUsageStatsSection(props) {
			if (props === null || typeof props !== "object") return null
			if (typeof props.useSessions !== "function" || typeof props.t !== "function") return null
			return react.createElement(AccountUsageStatsBoundary, null,
				react.createElement(AccountUsageStatsInner, props))
		}

		/** 账号页 = 既有的账号与余额卡片 + 其下方的本地用量统计。 */
		function AccountSection(props) {
			return react.createElement(react.Fragment, null,
				react.createElement(AccountSectionMain, props),
				react.createElement(AccountUsageStatsSection, props))
		}
		//#endregion
