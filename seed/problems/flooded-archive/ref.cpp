#include <bits/stdc++.h>
using namespace std;

static const int INF = INT_MAX;

static vector<int> bfs(const vector<int> &starts, const vector<char> &passable, int width) {
    vector<int> dist(passable.size(), INF);
    vector<int> queue;
    queue.reserve(passable.size());
    for (int s : starts) {
        dist[s] = 0;
        queue.push_back(s);
    }
    const int steps[4] = {1, -1, width, -width};
    for (size_t head = 0; head < queue.size(); head++) {
        int u = queue[head];
        for (int d : steps) {
            int v = u + d;
            if (passable[v] && dist[v] == INF) {
                dist[v] = dist[u] + 1;
                queue.push_back(v);
            }
        }
    }
    return dist;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int r, c;
    cin >> r >> c;
    int width = c + 2;
    int size = (r + 2) * width;
    vector<char> openCell(size, 0), walkable(size, 0);
    vector<int> water, exits;
    int start = -1;
    string row;
    for (int i = 0; i < r; i++) {
        cin >> row;
        for (int j = 0; j < c; j++) {
            char ch = row[j];
            if (ch == '#') continue;
            int cell = (i + 1) * width + j + 1;
            openCell[cell] = 1;
            if (ch == 'W') {
                water.push_back(cell);
                continue;
            }
            walkable[cell] = 1;
            if (ch == 'S') start = cell;
            else if (ch == 'E') exits.push_back(cell);
        }
    }
    vector<int> flood = bfs(water, openCell, width);
    vector<int> dist = bfs({start}, walkable, width);
    long long earliest = -1, wait = -1;
    bool forever = false;
    for (int e : exits) {
        if (dist[e] == INF) continue;
        if (flood[e] == INF) forever = true;
        else wait = max(wait, (long long)flood[e] - dist[e] - 1);
        if (dist[e] < flood[e] && (earliest < 0 || dist[e] < earliest)) earliest = dist[e];
    }
    cout << earliest << '\n';
    if (forever) cout << "FOREVER\n";
    else cout << (wait < 0 ? -1 : wait) << '\n';
    return 0;
}
