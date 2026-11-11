#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m;
    cin >> n >> m;
    vector<int> code(n + 1), taskOf(n + 1);
    for (int i = 1; i <= n; i++) {
        cin >> code[i];
        taskOf[code[i]] = i;
    }
    vector<vector<int>> adj(n + 1);
    vector<int> indeg(n + 1, 0);
    for (int i = 0; i < m; i++) {
        int a, b;
        cin >> a >> b;
        adj[a].push_back(b);
        indeg[b]++;
    }
    priority_queue<int, vector<int>, greater<int>> heap;
    for (int i = 1; i <= n; i++)
        if (indeg[i] == 0) heap.push(code[i]);
    vector<int> order;
    vector<char> done(n + 1, 0);
    while (!heap.empty()) {
        int u = taskOf[heap.top()];
        heap.pop();
        order.push_back(u);
        done[u] = 1;
        for (int v : adj[u])
            if (--indeg[v] == 0) heap.push(code[v]);
    }
    string out;
    if ((int)order.size() == n) {
        for (int i = 0; i < n; i++) {
            if (i) out += ' ';
            out += to_string(order[i]);
        }
        out += '\n';
    } else {
        vector<int> stuck;
        for (int i = 1; i <= n; i++)
            if (!done[i]) stuck.push_back(i);
        out += "CYCLE " + to_string(stuck.size()) + "\n";
        for (size_t i = 0; i < stuck.size(); i++) {
            if (i) out += ' ';
            out += to_string(stuck[i]);
        }
        out += '\n';
    }
    cout << out;
    return 0;
}
