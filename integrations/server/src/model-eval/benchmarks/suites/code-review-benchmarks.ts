/**
 * Code Review Benchmarks
 *
 * Benchmarks for code security detection, performance suggestions,
 * and code quality analysis.
 */

import type { BenchmarkDefinition, TestCase } from "../../types.js";

// =============================================================================
// Security Detection Test Cases
// =============================================================================

const securityDetectionCases: TestCase[] = [
  // SQL Injection
  {
    id: "code.security.sql-injection-basic",
    name: "Basic SQL injection detection",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code security reviewer. Analyze the code for security vulnerabilities. Output JSON: { \"vulnerabilities\": [{ \"type\": string, \"severity\": \"low\"|\"medium\"|\"high\"|\"critical\", \"line\": number, \"description\": string }] }",
        },
        {
          role: "user",
          content: `Review this code:
\`\`\`python
def get_user(username):
    query = f"SELECT * FROM users WHERE username = '{username}'"
    return db.execute(query)
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["sql", "injection"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["security", "sql-injection", "high-priority"],
  },
  {
    id: "code.security.sql-injection-subtle",
    name: "Subtle SQL injection via concatenation",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code security reviewer. Analyze the code for security vulnerabilities.",
        },
        {
          role: "user",
          content: `Review this code:
\`\`\`javascript
const searchProducts = (category, minPrice) => {
  let query = "SELECT * FROM products WHERE 1=1";
  if (category) query += " AND category = '" + category + "'";
  if (minPrice) query += " AND price >= " + minPrice;
  return db.query(query);
};
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["sql", "injection"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["security", "sql-injection", "subtle"],
  },

  // XSS
  {
    id: "code.security.xss-basic",
    name: "Basic XSS detection",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code security reviewer. Analyze the code for security vulnerabilities.",
        },
        {
          role: "user",
          content: `Review this code:
\`\`\`javascript
function renderComment(comment) {
  document.getElementById('comments').innerHTML += '<div>' + comment.text + '</div>';
}
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["xss", "cross-site"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["security", "xss", "high-priority"],
  },
  {
    id: "code.security.xss-react",
    name: "XSS via dangerouslySetInnerHTML",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code security reviewer. Identify security issues.",
        },
        {
          role: "user",
          content: `Review this React component:
\`\`\`jsx
function UserBio({ bio }) {
  return (
    <div
      className="bio"
      dangerouslySetInnerHTML={{ __html: bio }}
    />
  );
}
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["xss", "dangerous"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["security", "xss", "react"],
  },

  // Auth bypass
  {
    id: "code.security.auth-bypass",
    name: "Authentication bypass detection",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code security reviewer. Analyze the code for security vulnerabilities.",
        },
        {
          role: "user",
          content: `Review this code:
\`\`\`javascript
app.get('/admin/users', (req, res) => {
  // Check if user is admin
  if (req.query.isAdmin === 'true') {
    return res.json(getAllUsers());
  }
  return res.status(403).json({ error: 'Forbidden' });
});
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["auth", "bypass"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["security", "authentication", "critical"],
  },

  // Path traversal
  {
    id: "code.security.path-traversal",
    name: "Path traversal detection",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code security reviewer. Analyze the code for security vulnerabilities.",
        },
        {
          role: "user",
          content: `Review this code:
\`\`\`python
@app.route('/files/<filename>')
def serve_file(filename):
    return send_from_directory('/uploads', filename)
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["path", "traversal"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["security", "path-traversal"],
  },

  // Secure code (should not flag)
  {
    id: "code.security.secure-query",
    name: "Correctly identify secure parameterized query",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code security reviewer. Analyze the code for security vulnerabilities. If the code is secure, say so.",
        },
        {
          role: "user",
          content: `Review this code:
\`\`\`python
def get_user(username):
    query = "SELECT * FROM users WHERE username = %s"
    return db.execute(query, (username,))
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["secure", "parameterized"],
      notContains: ["vulnerability", "injection"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["security", "false-positive-check"],
  },
];

// =============================================================================
// Performance Suggestion Test Cases
// =============================================================================

const performanceSuggestionCases: TestCase[] = [
  // N+1 query
  {
    id: "code.performance.n-plus-one",
    name: "N+1 query detection",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code performance reviewer. Identify performance issues and suggest improvements.",
        },
        {
          role: "user",
          content: `Review this code for performance:
\`\`\`python
def get_orders_with_items():
    orders = Order.objects.all()
    result = []
    for order in orders:
        items = OrderItem.objects.filter(order_id=order.id)
        result.append({'order': order, 'items': list(items)})
    return result
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["n+1", "query"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["performance", "database", "n-plus-one"],
  },

  // Memory leak
  {
    id: "code.performance.memory-leak-listener",
    name: "Event listener memory leak",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code performance reviewer. Identify performance and memory issues.",
        },
        {
          role: "user",
          content: `Review this React component:
\`\`\`jsx
function DataFetcher({ url }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const handler = () => fetch(url).then(r => r.json()).then(setData);
    window.addEventListener('focus', handler);
    // Missing cleanup!
  }, [url]);

  return <div>{JSON.stringify(data)}</div>;
}
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["memory", "leak", "cleanup"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["performance", "memory", "react"],
  },

  // Inefficient loop
  {
    id: "code.performance.inefficient-loop",
    name: "Inefficient array operation in loop",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a code performance reviewer. Identify inefficiencies.",
        },
        {
          role: "user",
          content: `Review this code:
\`\`\`javascript
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j] && !duplicates.includes(arr[i])) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["O(n", "set", "complexity"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["performance", "algorithm", "complexity"],
  },

  // Unoptimized re-render
  {
    id: "code.performance.unnecessary-rerender",
    name: "Unnecessary React re-renders",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a React performance expert. Identify render inefficiencies.",
        },
        {
          role: "user",
          content: `Review this component:
\`\`\`jsx
function UserList({ users }) {
  return (
    <ul>
      {users.map(user => (
        <UserCard
          key={user.id}
          user={user}
          onClick={() => console.log(user.id)}
          style={{ margin: 10 }}
        />
      ))}
    </ul>
  );
}
\`\`\``,
        },
      ],
    },
    expected: {
      contains: ["re-render", "inline", "useCallback", "useMemo"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["performance", "react", "rendering"],
  },
];

// =============================================================================
// Exported Benchmark Definitions
// =============================================================================

export const codeReviewBenchmarks: BenchmarkDefinition[] = [
  {
    id: "code.security-detection",
    name: "Security Vulnerability Detection",
    description: "Tests the model's ability to detect common security vulnerabilities in code",
    version: "1.0.0",
    taskType: "code",
    category: "security",
    testCases: securityDetectionCases,
    config: {
      maxTokens: 500,
      temperature: 0,
      timeout: 20000,
    },
  },
  {
    id: "code.performance-suggestions",
    name: "Performance Issue Detection",
    description: "Tests the model's ability to identify performance problems and suggest improvements",
    version: "1.0.0",
    taskType: "code",
    category: "performance",
    testCases: performanceSuggestionCases,
    config: {
      maxTokens: 500,
      temperature: 0,
      timeout: 20000,
    },
  },
];
