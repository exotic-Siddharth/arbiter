#include <bits/stdc++.h>
using namespace std;

static vector<int> parent_, size_;

static int findRoot(int x) {
    while (parent_[x] != x) {
        parent_[x] = parent_[parent_[x]];
        x = parent_[x];
    }
    return x;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m;
    cin >> n >> m;
    parent_.resize(n + 1);
    size_.assign(n + 1, 1);
    iota(parent_.begin(), parent_.end(), 0);
    int groups = n, largest = 1, wasted = 0;
    string out;
    out.reserve((size_t)m * 16);
    for (int i = 0; i < m; i++) {
        int a, b;
        cin >> a >> b;
        a = findRoot(a);
        b = findRoot(b);
        if (a == b) {
            wasted++;
        } else {
            if (size_[a] < size_[b]) swap(a, b);
            parent_[b] = a;
            size_[a] += size_[b];
            groups--;
            largest = max(largest, size_[a]);
        }
        out += to_string(groups);
        out += ' ';
        out += to_string(largest);
        out += ' ';
        out += to_string(wasted);
        out += '\n';
    }
    cout << out;
    return 0;
}
