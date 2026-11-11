#include <bits/stdc++.h>
using namespace std;

// Z-function based search: z over pat + '#' + text marks every occurrence of pat.
static void markStarts(const string &pat, const string &text, int n, vector<char> &starts) {
    string s = pat + '#' + text;
    int len = (int)s.size(), m = (int)pat.size();
    vector<int> z(len, 0);
    for (int i = 1, l = 0, r = 0; i < len; i++) {
        if (i < r) z[i] = min(r - i, z[i - l]);
        while (i + z[i] < len && s[z[i]] == s[i + z[i]]) z[i]++;
        if (i + z[i] > r) l = i, r = i + z[i];
        if (i > m && z[i] >= m) {
            int start = i - m - 1;
            if (start < n) starts[start] = 1;
        }
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string t, p;
    cin >> t >> p;
    int n = (int)t.size(), m = (int)p.size();
    string text = t + t.substr(0, m - 1);
    vector<char> starts(n, 0);
    markStarts(p, text, n, starts);
    string back(p.rbegin(), p.rend());
    if (back != p) markStarts(back, text, n, starts);
    long long count = 0;
    int first = -1;
    for (int i = 0; i < n; i++) {
        if (starts[i]) {
            count++;
            if (first < 0) first = i + 1;
        }
    }
    cout << count << ' ' << first << '\n';
    return 0;
}
