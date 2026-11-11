#include <bits/stdc++.h>
using namespace std;

struct Line {
    int v;
    long long f, p, c;
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m, k;
    cin >> n >> m >> k;
    vector<vector<Line>> adj(n + 1);
    for (int i = 0; i < m; i++) {
        int u;
        Line l;
        cin >> u >> l.v >> l.f >> l.p >> l.c;
        adj[u].push_back(l);
    }
    const long long INF = LLONG_MAX;
    int layers = k + 1;
    // dist[node * layers + used]: earliest minute in node with `used` tickets spent.
    vector<long long> dist((size_t)(n + 1) * layers, INF);
    using State = pair<long long, int>;
    priority_queue<State, vector<State>, greater<State>> pq;
    dist[layers] = 0;
    pq.push({0, layers});
    while (!pq.empty()) {
        auto [t, state] = pq.top();
        pq.pop();
        if (t > dist[state]) continue;
        int u = state / layers, used = state % layers;
        if (u == n) continue;
        for (const Line &l : adj[u]) {
            long long depart = t <= l.f ? l.f : l.f + (t - l.f + l.p - 1) / l.p * l.p;
            int s = l.v * layers + used;
            if (depart + l.c < dist[s]) {
                dist[s] = depart + l.c;
                pq.push({dist[s], s});
            }
            if (used < k && t + l.c < dist[s + 1]) {
                dist[s + 1] = t + l.c;
                pq.push({dist[s + 1], s + 1});
            }
        }
    }
    long long best = INF;
    for (int used = 0; used < layers; used++) {
        best = min(best, dist[(size_t)n * layers + used]);
        if (used) cout << ' ';
        cout << (best == INF ? -1 : best);
    }
    cout << '\n';
    return 0;
}
